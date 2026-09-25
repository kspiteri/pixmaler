<script setup lang="ts">
// The one button. `variant` picks the fill/ink recipe, `size` the scale; `icon` makes it a
// square icon-only control, `block` full-width, `collapse` drops the label to its icon under
// $bp-mobile, `tone="danger"` a warn hover. Renders <a> when `href` is set. This owns the
// button identity (fill, border, press, hover, focus, disabled); a caller keeps only layout
// (position, flex, width) as a class, which merges in via $attrs.
// Click plays a press sound: a primary's `ding` by default. `sfx` overrides the key (any
// variant), `silent` suppresses it for this instance; the global mute still applies.

import type { SfxKey } from '@/lib'
import { useTemplateRef } from 'vue'
import { playSfx } from '@/lib'

// $attrs (class, @click, :disabled, title, aria-*, type="submit"…) lands on the root element,
// not this wrapper.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'tertiary' | 'subtle'
  size?: 'large' | 'default' | 'small' | 'x-small'
  icon?: boolean
  block?: boolean
  tone?: 'neutral' | 'danger'
  collapse?: boolean
  href?: string
  // Click sound key; overrides the default (a primary's `ding`) and plays on any variant.
  sfx?: SfxKey
  // Suppress this instance's click sound (wins over `sfx` and the default).
  silent?: boolean
}>(), {
  variant: 'tertiary',
  size: 'default',
  tone: 'neutral',
})

// Some callers need to move focus here imperatively (e.g. SettingsMenu on Escape).
const root = useTemplateRef<HTMLElement>('root')
defineExpose({ focus: () => root.value?.focus() })

// An explicit `sfx` wins; otherwise primary dings and other variants stay silent. `silent`
// mutes this instance. `playSfx` still honours the global sfx toggle and skips unrecorded keys.
function onPress() {
  if (props.silent)
    return
  const key = props.sfx ?? (props.variant === 'primary' ? 'ding' : null)
  if (key)
    playSfx(key)
}
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    ref="root"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, {
      'btn--icon': icon,
      'btn--block': block,
      'btn--danger': tone === 'danger',
      'btn--collapse': collapse,
    }]"
    :type="href ? undefined : 'button'"
    :href="href"
    v-bind="$attrs"
    @click="onPress"
  >
    <span v-if="$slots.icon" class="btn__icon"><slot name="icon" /></span>
    <span v-if="$slots.default" class="btn__label"><slot /></span>
    <span v-if="$slots.trailing" class="btn__trailing"><slot name="trailing" /></span>
  </component>
</template>
