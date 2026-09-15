<script setup lang="ts">
// Dev-only component gallery (/components) — every Button variant × size × modifier on one
// page, so straggling CSS is easy to spot against the real page. Gated to import.meta.env.DEV
// in App.vue's router and linked from nowhere. Add future components as new sections below.

import { ChevronDown, House, Image as ImageIcon, Play, Settings } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import { appHref } from '@/lib'

const variants = ['primary', 'secondary', 'tertiary', 'subtle'] as const
const sizes = ['large', 'default', 'small', 'x-small'] as const
const backHref = appHref()
</script>

<template>
  <div class="page components">
    <a class="components__back" :href="backHref">← Back to entry</a>
    <h1 class="components__title">
      Components
    </h1>
    <p class="components__intro">
      Dev-only gallery, linked from nowhere. Every Button variant, size and modifier — hover and
      press are live, so drift shows up against the real page background.
    </p>

    <section class="components__section">
      <h2 class="components__heading">
        button — variant × size
      </h2>
      <div class="components__matrix">
        <div v-for="v in variants" :key="v" class="components__row">
          <Button v-for="s in sizes" :key="`${v}-${s}`" :variant="v" :size="s">
            {{ v }} · {{ s }}
          </Button>
        </div>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        states
      </h2>
      <div class="components__row">
        <template v-for="v in variants" :key="v">
          <Button :variant="v">
            {{ v }}
          </Button>
          <Button :variant="v" disabled>
            {{ v }} disabled
          </Button>
        </template>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        leading icon
      </h2>
      <div class="components__row">
        <Button v-for="v in variants" :key="v" :variant="v">
          <template #icon>
            <Play :size="18" aria-hidden="true" />
          </template>
          {{ v }}
        </Button>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        icon only (square)
      </h2>
      <div class="components__row">
        <Button v-for="s in sizes" :key="s" variant="subtle" icon :size="s" aria-label="Settings">
          <template #icon>
            <Settings :size="18" aria-hidden="true" />
          </template>
        </Button>
      </div>
      <div class="components__row">
        <Button v-for="v in variants" :key="v" :variant="v" icon aria-label="Settings">
          <template #icon>
            <Settings :size="18" aria-hidden="true" />
          </template>
        </Button>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        danger tone
      </h2>
      <div class="components__row">
        <Button variant="subtle" size="x-small" tone="danger">
          Remove
        </Button>
        <Button variant="subtle" tone="danger">
          Delete
        </Button>
        <Button variant="subtle" tone="danger" disabled>
          Delete disabled
        </Button>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        block + disclosure
      </h2>
      <div class="components__stack">
        <Button variant="primary" block>
          <template #icon>
            <Play :size="18" aria-hidden="true" />
          </template>
          Block primary
        </Button>
        <Button variant="subtle" size="x-small" block aria-label="Reference image">
          <template #icon>
            <ImageIcon :size="14" aria-hidden="true" />
          </template>
          reference
          <template #trailing>
            <ChevronDown :size="14" />
          </template>
        </Button>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        link (renders &lt;a&gt;)
      </h2>
      <div class="components__row">
        <Button variant="secondary" :href="backHref">
          <template #icon>
            <House :size="18" aria-hidden="true" />
          </template>
          Link button
        </Button>
      </div>
    </section>

    <section class="components__section">
      <h2 class="components__heading">
        collapse (mobile only)
      </h2>
      <p class="components__note">
        Narrow the viewport below the mobile breakpoint — the label drops and the icon remains.
      </p>
      <div class="components__row">
        <Button variant="secondary" collapse aria-label="Collapse demo">
          <template #icon>
            <Settings :size="16" aria-hidden="true" />
          </template>
          Collapse demo
        </Button>
      </div>
    </section>
  </div>
</template>
