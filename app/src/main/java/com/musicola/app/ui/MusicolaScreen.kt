package com.musicola.app.ui

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueuePlayNext
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import coil.compose.AsyncImage
import com.musicola.app.data.Track
import kotlinx.coroutines.delay

private val Accent = Color(0xFFFF4D6D)
private val Bg = Color(0xFF0F0F12)
private val Panel = Color(0xFF18181D)
private val Muted = Color(0xFF8B8B96)

private val Scheme = darkColorScheme(
    primary = Accent, onPrimary = Color.White, background = Bg, surface = Bg,
    surfaceVariant = Panel, onSurface = Color(0xFFECECF1), onSurfaceVariant = Muted,
)

@Composable
fun MusicolaScreen(vm: PlayerViewModel) {
    MaterialTheme(colorScheme = Scheme) {
        Surface(Modifier.fillMaxSize(), color = Bg) {
            var tab by rememberSaveable { mutableIntStateOf(0) }

            // Barra de progreso: se refresca mientras suena
            LaunchedEffect(vm.isPlaying) {
                while (vm.isPlaying) { vm.tick(); delay(500) }
            }
            // Mensajes breves ("Añadida a la cola"…) que desaparecen solos
            LaunchedEffect(vm.message) {
                val m = vm.message
                if (m != null && !m.startsWith("Error") && !m.startsWith("No se pudo") && m != "Sin resultados.") {
                    delay(1800); if (vm.message == m) vm.consumeMessage()
                }
            }

            Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
                SearchBar(vm) { tab = 0 }
                TabRow(selectedTabIndex = tab, containerColor = Bg, contentColor = Accent) {
                    listOf("Resultados", "Cola (${vm.queue.size})", "Favoritos (${vm.favs.size})")
                        .forEachIndexed { i, label ->
                            Tab(selected = tab == i, onClick = { tab = i; vm.prefetchTab(i) },
                                text = { Text(label, fontSize = 13.sp, maxLines = 1) })
                        }
                }
                Box(Modifier.weight(1f)) {
                    when (tab) {
                        0 -> ResultsList(vm)
                        1 -> QueueList(vm)
                        else -> FavsList(vm)
                    }
                    vm.message?.let {
                        Text(
                            it, color = Color.White, fontSize = 13.sp,
                            modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp)
                                .clip(RoundedCornerShape(20.dp)).background(Color(0xE6303038))
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        )
                    }
                }
                if (vm.current != null) PlayerBar(vm)
            }
        }
    }
}

@Composable
private fun SearchBar(vm: PlayerViewModel, onSearch: () -> Unit) {
    val focus = LocalFocusManager.current
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        OutlinedTextField(
            value = vm.query,
            onValueChange = { vm.onQueryChange(it) },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Buscar canción, artista…") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            trailingIcon = {
                if (vm.query.isNotEmpty()) IconButton(onClick = { vm.query = "" }) {
                    Icon(Icons.Default.Clear, "Borrar")
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(28.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                focus.clearFocus(); onSearch(); vm.search()
            }),
            colors = OutlinedTextFieldDefaults.colors(
                unfocusedContainerColor = Panel, focusedContainerColor = Panel,
                unfocusedBorderColor = Color(0xFF2A2A31),
            ),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
            FilterChip(selected = vm.onlySongs, onClick = { vm.chooseOnlySongs(true) }, label = { Text("Canciones") })
            FilterChip(selected = !vm.onlySongs, onClick = { vm.chooseOnlySongs(false) }, label = { Text("Vídeos") })
        }
    }
}

@Composable
private fun ResultsList(vm: PlayerViewModel) {
    if (vm.loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Accent) }
        return
    }
    if (vm.results.isEmpty()) {
        Hint("Busca algo para empezar 🎵")
        return
    }
    LazyColumn(contentPadding = PaddingValues(8.dp)) {
        itemsIndexed(vm.results, key = { i, t -> "r$i${t.id}" }) { _, t ->
            TrackRow(t, playing = vm.current?.id == t.id, onClick = { vm.playNow(t) }, onPress = { vm.prefetchOne(t) }) {
                SmallAction(Icons.Default.Radio, "Iniciar radio") { vm.startRadio(t) }
                SmallAction(Icons.Default.QueuePlayNext, "Reproducir después") { vm.playNext(t) }
                SmallAction(Icons.Default.Add, "Añadir a la cola") { vm.addToQueue(t) }
                FavAction(vm, t)
            }
        }
    }
}

@Composable
private fun QueueList(vm: PlayerViewModel) {
    if (vm.queue.isEmpty()) { Hint("La cola está vacía"); return }
    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { vm.clearQueue() }) { Text("Vaciar cola", color = Muted) }
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp)) {
            itemsIndexed(vm.queue, key = { i, t -> "q$i${t.id}" }) { i, t ->
                TrackRow(t, playing = i == vm.currentIndex, onClick = { vm.playAt(i) }, onPress = { vm.prefetchOne(t) }) {
                    SmallAction(Icons.Default.KeyboardArrowUp, "Subir") { vm.moveUp(i) }
                    SmallAction(Icons.Default.Close, "Quitar") { vm.removeAt(i) }
                }
            }
        }
    }
}

@Composable
private fun FavsList(vm: PlayerViewModel) {
    if (vm.favs.isEmpty()) { Hint("Aún no tienes favoritos. Pulsa ♡ en cualquier canción."); return }
    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { vm.playList(vm.favs.shuffled(), 0) }) { Text("Aleatorio", color = Accent) }
            TextButton(onClick = { vm.playList(vm.favs, 0) }) { Text("Reproducir todo", color = Accent) }
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp)) {
            itemsIndexed(vm.favs, key = { _, t -> "f${t.id}" }) { i, t ->
                TrackRow(t, playing = vm.current?.id == t.id, onClick = { vm.playList(vm.favs, i) }, onPress = { vm.prefetchOne(t) }) {
                    SmallAction(Icons.Default.Radio, "Iniciar radio") { vm.startRadio(t) }
                    SmallAction(Icons.Default.Add, "Añadir a la cola") { vm.addToQueue(t) }
                    FavAction(vm, t)
                }
            }
        }
    }
}

@Composable
private fun TrackRow(
    t: Track,
    playing: Boolean,
    onClick: () -> Unit,
    onPress: () -> Unit = {},
    actions: @Composable () -> Unit,
) {
    // Al tocar (antes de levantar el dedo) se empieza a preparar la canción
    val interaction = remember { MutableInteractionSource() }
    val currentOnPress by rememberUpdatedState(onPress)
    LaunchedEffect(interaction) {
        interaction.interactions.collect { if (it is PressInteraction.Press) currentOnPress() }
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(if (playing) Color(0xFF2A1820) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = t.thumb, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(48.dp).clip(RoundedCornerShape(6.dp)).background(Panel),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = if (playing) Accent else MaterialTheme.colorScheme.onSurface)
            Text(
                listOfNotNull(t.artist.takeIf { it.isNotBlank() }, t.duration.takeIf { it > 0 }?.let { fmt(it * 1000) })
                    .joinToString(" · "),
                maxLines = 1, overflow = TextOverflow.Ellipsis, color = Muted, fontSize = 13.sp,
            )
        }
        actions()
    }
}

@Composable
private fun SmallAction(icon: ImageVector, desc: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(36.dp)) {
        Icon(icon, desc, tint = Muted, modifier = Modifier.size(21.dp))
    }
}

@Composable
private fun FavAction(vm: PlayerViewModel, t: Track) {
    val fav = vm.isFav(t.id)
    IconButton(onClick = { vm.toggleFav(t) }, modifier = Modifier.size(36.dp)) {
        Icon(if (fav) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "Favorito",
            tint = if (fav) Accent else Muted, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun Hint(text: String) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, color = Muted)
    }
}

@Composable
private fun PlayerBar(vm: PlayerViewModel) {
    val t = vm.current ?: return
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }

    Column(
        Modifier.fillMaxWidth().background(Panel).navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 6.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = t.thumb, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(t.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(t.artist, color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FavAction(vm, t)
        }

        val dur = vm.duration.coerceAtLeast(1L)
        Slider(
            value = if (dragging) dragValue else (vm.position.toFloat() / dur).coerceIn(0f, 1f),
            onValueChange = { dragging = true; dragValue = it },
            onValueChangeFinished = { vm.seekTo((dragValue * dur).toLong()); dragging = false },
            colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent),
            modifier = Modifier.height(28.dp),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(fmt(if (dragging) (dragValue * dur).toLong() else vm.position), color = Muted, fontSize = 12.sp)
            Text(fmt(vm.duration), color = Muted, fontSize = 12.sp)
        }

        Row(
            Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = vm::toggleShuffle) {
                Icon(Icons.Default.Shuffle, "Aleatorio", tint = if (vm.shuffle) Accent else Muted)
            }
            IconButton(onClick = vm::previous) { Icon(Icons.Default.SkipPrevious, "Anterior", Modifier.size(32.dp)) }
            Box(
                Modifier.size(56.dp).clip(CircleShape).background(Color(0xFFECECF1)).clickable { vm.togglePlay() },
                contentAlignment = Alignment.Center,
            ) {
                if (vm.isBuffering && !vm.isPlaying) {
                    CircularProgressIndicator(color = Bg, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                } else {
                    Icon(if (vm.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        "Reproducir", tint = Bg, modifier = Modifier.size(32.dp))
                }
            }
            IconButton(onClick = vm::next) { Icon(Icons.Default.SkipNext, "Siguiente", Modifier.size(32.dp)) }
            IconButton(onClick = vm::toggleRadio) {
                Icon(Icons.Default.Radio, "Modo radio", tint = if (vm.radio) Accent else Muted)
            }
            IconButton(onClick = vm::cycleRepeat) {
                Icon(
                    if (vm.repeatMode == Player.REPEAT_MODE_ONE) Icons.Default.RepeatOne else Icons.Default.Repeat,
                    "Repetir", tint = if (vm.repeatMode != Player.REPEAT_MODE_OFF) Accent else Muted,
                )
            }
        }
    }
}

private fun fmt(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
}
