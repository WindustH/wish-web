<template>
  <!-- Each letter is one paper strip. Every fold flips the strip, so its faces
       alternate between the paper's front (text colour) and back (accent);
       the i's dot is a folded square in the crane's colours. -->
  <svg class="wordmark" viewBox="-1 -1 266.4 102" role="img" aria-label="Wish">
    <polygon class="front" points="0,0 17.6,0 44.6,100 27,100" />
    <polygon class="back" points="27,100 44.6,100 63.5,30 45.9,30" />
    <polygon class="front" points="45.9,30 63.5,30 82.4,100 64.8,100" />
    <polygon class="back" points="64.8,100 82.4,100 109.4,0 91.8,0" />
    <polygon class="front" points="119.4,38 136.4,32 136.4,100 119.4,100" />
    <polygon class="dot-light" points="127.9,2 127.9,22 117.9,12" />
    <polygon class="dot-dark" points="127.9,2 137.9,12 127.9,22" />
    <polygon class="front" points="199.4,32 149.4,32 166.4,46 199.4,46" />
    <polygon class="back" points="149.4,32 149.4,73 166.4,59 166.4,46" />
    <polygon class="front" points="166.4,59 149.4,73 182.4,73 199.4,59" />
    <polygon class="back" points="199.4,59 182.4,73 182.4,86 199.4,100" />
    <polygon class="front" points="199.4,100 182.4,86 149.4,86 149.4,100" />
    <polygon class="back" points="216.4,32 264.4,32 247.4,46 216.4,46" />
    <polygon class="front" points="264.4,32 264.4,100 247.4,100 247.4,46" />
    <polygon class="front" points="212.4,6 229.4,0 229.4,100 212.4,100" />
  </svg>
</template>

<style scoped>
.wordmark { display: block; width: auto; }
.front { fill: currentColor; }
.back { fill: var(--accent); }
.dot-light { fill: #eea07c; }
.dot-dark { fill: #c9653f; }
</style>
