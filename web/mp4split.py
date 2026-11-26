"""
Trocea el primer fragmento de un MP4 fragmentado (el audio de YouTube) en fragmentos
más cortos, sin recomprimir: solo se reparten sus muestras en varios moof+mdat.

Sirve para HLS en Safari: Safari descarga 2-3 fragmentos antes de empezar a sonar. Con
fragmentos de ~2 s en lugar de ~10 s, tiene que bajar unas 5 veces menos datos.
Los fragmentos nuevos usan la misma cabecera (moov) que el original, así que encajan con
el resto de la canción sin cortes.
"""
import struct


def _boxes(buf, start, end):
    i = start
    while i + 8 <= end:
        size, typ = struct.unpack(">I4s", buf[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack(">Q", buf[i + 8:i + 16])[0]
            hdr = 16
        elif size == 0:
            size = end - i
        if size < hdr or i + size > end:
            return
        yield typ, i, hdr, i + size
        i += size


def _find(buf, start, end, path):
    for typ, s, h, e in _boxes(buf, start, end):
        if typ == path[0]:
            return (s, h, e) if len(path) == 1 else _find(buf, s + h, e, path[1:])
    return None


def _trex_defaults(buf, init_end):
    """default_sample_duration/size/flags de moov/mvex/trex."""
    r = _find(buf, 0, init_end, [b"moov", b"mvex", b"trex"])
    if not r:
        return 0, 0, 0
    s, h, _ = r
    b = s + h + 4  # versión + flags
    _tid, _sdi, dur, size, flags = struct.unpack(">IIIII", buf[b:b + 20])
    return dur, size, flags


def _box(typ, payload):
    return struct.pack(">I4s", 8 + len(payload), typ) + payload


def _full(typ, version, flags, payload):
    return _box(typ, struct.pack(">I", (version << 24) | flags) + payload)


def split_first_fragment(buf, init_end, frag_off, frag_len, target_seconds=2.0):
    """
    buf: bytes del archivo desde el principio (incluye cabecera y el primer fragmento).
    Devuelve (lista de (bytes_fragmento, segundos), timescale) o None si no se puede.
    """
    end = frag_off + frag_len
    if end > len(buf):
        return None
    timescale_r = _find(buf, 0, init_end, [b"moov", b"trak", b"mdia", b"mdhd"])
    if not timescale_r:
        return None
    s, h, _ = timescale_r
    ver = buf[s + h]
    timescale = struct.unpack(">I", buf[s + h + (20 if ver == 1 else 12): s + h + (24 if ver == 1 else 16)])[0]
    trex_dur, trex_size, _trex_flags = _trex_defaults(buf, init_end)

    moof = mdat = None
    for typ, bs, bh, be in _boxes(buf, frag_off, end):
        if typ == b"moof" and moof is None:
            moof = (bs, bh, be)
        elif typ == b"mdat" and moof is not None and mdat is None:
            mdat = (bs, bh, be)
    if not moof or not mdat:
        return None
    ms, mh, me = moof
    trafs = [b for b in _boxes(buf, ms + mh, me) if b[0] == b"traf"]
    if len(trafs) != 1:
        return None
    _, ts, th, te = trafs[0]
    tfhd = tfdt = trun = None
    for typ, bs, bh, be in _boxes(buf, ts + th, te):
        if typ == b"tfhd":
            tfhd = (bs + bh, be)
        elif typ == b"tfdt":
            tfdt = (bs + bh, be)
        elif typ == b"trun":
            if trun is not None:
                return None  # varios trun: no soportado
            trun = (bs + bh, be)
    if not (tfhd and tfdt and trun):
        return None

    # tfhd
    p, _ = tfhd
    vf = struct.unpack(">I", buf[p:p + 4])[0]
    tf_flags = vf & 0xFFFFFF
    track_id = struct.unpack(">I", buf[p + 4:p + 8])[0]
    q = p + 8
    base_data_offset = None
    sdi = def_dur = def_size = def_flags = None
    if tf_flags & 0x1:
        base_data_offset = struct.unpack(">Q", buf[q:q + 8])[0]; q += 8
    if tf_flags & 0x2:
        sdi = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
    if tf_flags & 0x8:
        def_dur = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
    if tf_flags & 0x10:
        def_size = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
    if tf_flags & 0x20:
        def_flags = struct.unpack(">I", buf[q:q + 4])[0]; q += 4

    # tfdt
    p, _ = tfdt
    v = buf[p]
    base_time = struct.unpack(">Q" if v == 1 else ">I", buf[p + 4:p + (12 if v == 1 else 8)])[0]

    # trun
    p, _ = trun
    vf = struct.unpack(">I", buf[p:p + 4])[0]
    tr_ver, tr_flags = vf >> 24, vf & 0xFFFFFF
    count = struct.unpack(">I", buf[p + 4:p + 8])[0]
    q = p + 8
    data_offset = 0
    first_flags = None
    if tr_flags & 0x1:
        data_offset = struct.unpack(">i", buf[q:q + 4])[0]; q += 4
    if tr_flags & 0x4:
        first_flags = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
    samples = []  # (duración, tamaño, flags o None, cto o None)
    for i in range(count):
        d = sz = fl = cto = None
        if tr_flags & 0x100:
            d = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
        if tr_flags & 0x200:
            sz = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
        if tr_flags & 0x400:
            fl = struct.unpack(">I", buf[q:q + 4])[0]; q += 4
        if tr_flags & 0x800:
            cto = struct.unpack(">i" if tr_ver else ">I", buf[q:q + 4])[0]; q += 4
        d = d if d is not None else (def_dur if def_dur is not None else trex_dur)
        sz = sz if sz is not None else (def_size if def_size is not None else trex_size)
        if i == 0 and first_flags is not None and fl is None:
            fl = first_flags
        if not d or not sz:
            return None
        samples.append((d, sz, fl, cto))

    # Dónde empiezan los datos de las muestras
    if base_data_offset is not None:
        data_start = base_data_offset + data_offset
    else:  # default-base-is-moof (o sin base: también el moof)
        data_start = ms + data_offset
    total = sum(sz for _, sz, _, _ in samples)
    if data_start < 0 or data_start + total > len(buf):
        return None

    # Reparto en trozos de ~target_seconds
    target = int(target_seconds * timescale)
    parts, cur, acc = [], [], 0
    for smp in samples:
        cur.append(smp)
        acc += smp[0]
        if acc >= target:
            parts.append(cur); cur, acc = [], 0
    if cur:
        parts.append(cur)
    if len(parts) < 2:
        return None

    out = []
    pos, t = data_start, base_time
    has_flags = any(s[2] is not None for s in samples)
    has_cto = any(s[3] is not None for s in samples)
    for n, part in enumerate(parts):
        # tfhd: misma pista; datos relativos al moof; se conservan índice y flags por defecto
        nf = 0x20000
        extra = b""
        if sdi is not None:
            nf |= 0x2; extra += struct.pack(">I", sdi)
        if def_flags is not None:
            nf |= 0x20; extra += struct.pack(">I", def_flags)
        tfhd_b = _full(b"tfhd", 0, nf, struct.pack(">I", track_id) + extra)
        tfdt_b = _full(b"tfdt", 1, 0, struct.pack(">Q", t))
        rf = 0x1 | 0x100 | 0x200 | (0x400 if has_flags else 0) | (0x800 if has_cto else 0)
        rows = b""
        for d, sz, fl, cto in part:
            rows += struct.pack(">II", d, sz)
            if has_flags:
                rows += struct.pack(">I", fl if fl is not None else (def_flags or 0))
            if has_cto:
                rows += struct.pack(">i", cto or 0)
        # data_offset provisional; se calcula cuando se conoce el tamaño del moof
        def build(off):
            trun_b = _full(b"trun", 1 if has_cto else 0, rf, struct.pack(">Ii", len(part), off) + rows)
            traf_b = _box(b"traf", tfhd_b + tfdt_b + trun_b)
            mfhd_b = _full(b"mfhd", 0, 0, struct.pack(">I", n + 1))
            return _box(b"moof", mfhd_b + traf_b)
        moof_len = len(build(0))
        moof_b = build(moof_len + 8)
        size = sum(sz for _, sz, _, _ in part)
        mdat_b = _box(b"mdat", bytes(buf[pos:pos + size]))
        dur = sum(d for d, _, _, _ in part)
        out.append((moof_b + mdat_b, dur / timescale))
        pos += size
        t += dur
    return out, timescale
