// Public surface of the game components. Internal-only pieces — CropWidget (inside
// ImagePicker), PaletteTools (inside DrawBoard) and SalonFrame (inside the salon wall/modal) —
// are deliberately not re-exported; their siblings reach them by relative import.

export { default as DrawBoard } from './canvas/DrawBoard.vue'
export { default as ImagePicker } from './image/ImagePicker.vue'
export { default as MusicControl } from './image/picker/MusicControl.vue'
export { default as GmControls } from './lobby/GmControls.vue'
export { default as PlayerList } from './lobby/PlayerList.vue'
export { default as MusicWidget } from './shared/MusicWidget.vue'
export { default as PixelThumb } from './shared/PixelThumb.vue'
export { default as SalonWall } from './voting/SalonWall.vue'
export { default as VotingCloseup } from './voting/VotingCloseup.vue'
