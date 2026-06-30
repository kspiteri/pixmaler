<script setup lang="ts">
// Hidden page (/taglines) — lists every tagline grouped: the fixed lines,
// then each template as its own group (pattern + expanded options) so the set
// can be read in bulk and new ones suggested. Not linked from anywhere.

import { taglineGroups } from '../lib/taglines'

const { fixed, templates } = taglineGroups()
const total = fixed.length + templates.reduce((n, t) => n + t.expanded.length, 0)
const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const backHref = `${base}/`
const ghIssue = 'https://github.com/kspiteri/pixmaler/issues/new'
</script>

<template>
  <div class="page page--narrow taglines">
    <a class="taglines__back" :href="backHref">← Back to entry</a>
    <h1 class="taglines__title">
      Taglines
    </h1>
    <p class="taglines__intro">
      All {{ total }} taglines currently in the game. If you have any suggestions, create an <a :href="ghIssue" target="_blank">issue</a> in github and label it as enhancement.
    </p>

    <!-- Fixed lines, then each template as its own numbered group with the
         expanded options nested beneath. -->
    <ol class="taglines__list">
      <li v-for="line in fixed" :key="line" class="taglines__item">
        {{ line }}
      </li>
      <li
        v-for="t in templates"
        :key="t.pattern"
        class="taglines__item taglines__item--template"
      >
        {{ t.pattern }}
        <ul class="taglines__sublist">
          <li v-for="line in t.expanded" :key="line" class="taglines__subitem">
            {{ line }}
          </li>
        </ul>
      </li>
    </ol>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.taglines {
  &__back {
    display: inline-block;
    margin-bottom: $gap-4;
    color: $fg-50;
    font-size: 0.875rem;
    text-decoration: none;

    &:hover {
      color: $fg;
    }
  }

  &__title {
    margin: 0 0 $gap-2;
    font-family: $font-display;
    font-weight: 700;
    font-size: 2rem;
  }

  &__intro {
    margin: 0 0 $gap-5;
    color: $fg-50;
    font-size: 0.9375rem;
    line-height: 1.5;
    a {
      color: $fg-60;
    }
  }

  &__list {
    margin: 0;
    padding-left: $gap-5;
    display: flex;
    flex-direction: column;
    gap: $gap-3;
  }

  &__item {
    color: $fg-80;
    font-family: $font-body;
    line-height: 1.4;
  }

  // Template rows: the pattern label, with its expansions nested beneath.
  &__item--template {
    color: $fg;
  }

  &__sublist {
    margin: $gap-2 0 0;
    padding-left: $gap-4;
    display: flex;
    flex-direction: column;
    gap: $gap-1;
    list-style: disc;
  }

  &__subitem {
    color: $fg-50;
    font-size: 0.875rem;
    line-height: 1.4;
  }
}
</style>
