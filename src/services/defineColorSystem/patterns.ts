import stripeUrl from '../../assets/define-color/patterns/stripe.png';
import liquidUrl from '../../assets/define-color/patterns/liquid.png';
import warpUrl from '../../assets/define-color/patterns/warp.png';
import noiseUrl from '../../assets/define-color/patterns/noise.png';
import starlightUrl from '../../assets/define-color/patterns/starlight.png';
import dotsUrl from '../../assets/define-color/patterns/dots.png';
import dots2Url from '../../assets/define-color/patterns/dots-2.png';
import defineUrl from '../../assets/define-color/patterns/define.png';
import { DEFINE_PATTERN_ORDER } from './constants';
import type { DefinePattern } from './types';

export const DEFINE_PATTERN_URLS: Record<DefinePattern, string> = {
  none: 'none',
  stripe: `url("${stripeUrl}")`, liquid: `url("${liquidUrl}")`, warp: `url("${warpUrl}")`,
  noise: `url("${noiseUrl}")`, starlight: `url("${starlightUrl}")`, dots: `url("${dotsUrl}")`,
  'dots-2': `url("${dots2Url}")`, define: `url("${defineUrl}")`,
};

export function nextPattern(current: DefinePattern): DefinePattern {
  const index = DEFINE_PATTERN_ORDER.indexOf(current);
  return DEFINE_PATTERN_ORDER[(index + 1) % DEFINE_PATTERN_ORDER.length];
}
