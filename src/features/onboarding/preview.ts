import { shallowRef } from 'vue';

/** Settings can open the first-run setup over the app to try it; nothing is saved. */
export const onboardingPreview = shallowRef(false);
export const openOnboardingPreview = () => { onboardingPreview.value = true; };
export const closeOnboardingPreview = () => { onboardingPreview.value = false; };
