<template>
  <!-- The W is one paper strip folded along its flat creases, so its strokes
       alternate between the paper's front (text colour) and back (accent).
       Every other corner is cut at 45°, matching the folded-square dot. -->
  <svg class="wordmark" viewBox="-1 16 270 85" role="img" aria-label="Wish">
    <polygon class="front" points="0.2,22 16.3,22 37,100 21,100" />
    <polygon class="back" points="20.5,100 37.5,100 66.5,34 49.5,34" />
    <polygon class="front" points="49.5,34 66.5,34 95.5,100 78.5,100" />
    <polygon class="back" points="79,100 95,100 115.8,22 99.7,22" />
    <polygon class="front" points="125,49 134,40 140,40 140,100 125,100" />
    <polygon class="dot-light" points="132.5,17 132.5,35 123.5,26" />
    <polygon class="dot-dark" points="132.5,17 141.5,26 132.5,35" />
    <polygon class="front" points="161,40 202,40 202,51.5 167,51.5 167,64.2 202,64.2 202,91 193,100 152,100 152,88.5 187,88.5 187,75.8 152,75.8 152,49" />
    <polygon class="front" points="214,31 223,22 229,22 229,40 259,40 268,49 268,100 253,100 253,51.5 229,51.5 229,100 214,100" />
  </svg>
</template>

<style scoped>
.wordmark { display: block; width: auto; }
.front { fill: currentColor; }
.back { fill: var(--accent); }
.dot-light { fill: #eea07c; }
.dot-dark { fill: #c9653f; }
</style>
