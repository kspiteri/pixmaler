<script setup lang="ts">
// Hidden page (/taglines) — lists every tagline grouped: fixed lines, then each
// template as its own group (pattern + expanded options). Not linked from anywhere.

import { appHref, taglineGroups } from '@/lib'

const { fixed, templates } = taglineGroups()
const total = fixed.length + templates.reduce((n, t) => n + t.expanded.length, 0)
const backHref = appHref()
const ghIssue = 'https://github.com/kspiteri/pixmaler/issues/new'
</script>

<template>
  <div class="page page--narrow taglines">
    <a class="taglines__back" :href="backHref">← Back to entry</a>
    <h1 class="taglines__title">
      Taglines
    </h1>
    <p class="taglines__intro">
      All {{ total }} taglines currently in the game. If you have any suggestions, create an <a :href="ghIssue" target="_blank">issue</a> in GitHub and label it as enhancement.
    </p>

    <!-- Fixed lines, then each template as its own numbered group. -->
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
