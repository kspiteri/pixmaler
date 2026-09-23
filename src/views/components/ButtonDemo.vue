<script setup lang="ts">
// Gallery section: every Button variant × size × modifier. Layout classes (`demo__*`) are
// styled by the parent gallery via :deep(), so this file carries no CSS of its own.

import { ChevronDown, House, Image as ImageIcon, Play, Settings } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import { appHref } from '@/lib'

const variants = ['primary', 'secondary', 'tertiary', 'subtle'] as const
const sizes = ['large', 'default', 'small', 'x-small'] as const
const backHref = appHref()
</script>

<template>
  <div>
    <section class="demo__section">
      <h4 class="demo__heading">
        variant × size
      </h4>
      <div class="demo__matrix">
        <div v-for="v in variants" :key="v" class="demo__row">
          <Button v-for="s in sizes" :key="`${v}-${s}`" :variant="v" :size="s">
            {{ v }} · {{ s }}
          </Button>
        </div>
      </div>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        states
      </h4>
      <div class="demo__row">
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

    <section class="demo__section">
      <h4 class="demo__heading">
        leading icon
      </h4>
      <div class="demo__row">
        <Button v-for="v in variants" :key="v" :variant="v">
          <template #icon>
            <Play :size="18" aria-hidden="true" />
          </template>
          {{ v }}
        </Button>
      </div>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        icon only (square)
      </h4>
      <div class="demo__row">
        <Button v-for="s in sizes" :key="s" variant="subtle" icon :size="s" aria-label="Settings">
          <template #icon>
            <Settings :size="18" aria-hidden="true" />
          </template>
        </Button>
      </div>
      <div class="demo__row">
        <Button v-for="v in variants" :key="v" :variant="v" icon aria-label="Settings">
          <template #icon>
            <Settings :size="18" aria-hidden="true" />
          </template>
        </Button>
      </div>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        danger tone
      </h4>
      <div class="demo__row">
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

    <section class="demo__section">
      <h4 class="demo__heading">
        block + disclosure
      </h4>
      <div class="demo__stack">
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

    <section class="demo__section">
      <h4 class="demo__heading">
        link (renders &lt;a&gt;)
      </h4>
      <div class="demo__row">
        <Button variant="secondary" :href="backHref">
          <template #icon>
            <House :size="18" aria-hidden="true" />
          </template>
          Link button
        </Button>
      </div>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        collapse (mobile only)
      </h4>
      <p class="demo__note">
        Narrow the viewport below the mobile breakpoint — the label drops and the icon remains.
      </p>
      <div class="demo__row">
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
