import { readFileSync } from "node:fs";
import { join } from "node:path";
import NativeletSite from "./components/nativelet-site";

const components = {
  player: { dir: "packages/ui/src/components/mini-player", files: ["MiniPlayer.tsx", "playerMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  path: { dir: "packages/ui/src/components/motion-path-editor", files: ["SignatureCanvas.tsx", "signatureMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  timeline: { dir: "packages/ui/src/components/timeline-trim", files: ["TimelineTrim.tsx", "timelineMath.ts", "timelineGesture.ts", "Example.tsx", "timelineFixture.ts", "README.md", "LICENSE"] },
  wheel: { dir: "packages/ui/src/components/wheel-time-picker", files: ["WheelTimePicker.tsx", "wheelMath.ts", "wheelDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  range: { dir: "packages/ui/src/components/range-stack", files: ["RangeStack.tsx", "rangeMath.ts", "rangeDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  strings: { dir: "packages/ui/src/components/plucked-strings", files: ["PluckedStrings.tsx", "stringMath.ts", "stringDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  hourglass: { dir: "packages/ui/src/components/sand-hourglass", files: ["SandHourglass.tsx", "sandMath.ts", "sandDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  prism: { dir: "packages/ui/src/components/prism", files: ["Prism.tsx", "prismMath.ts", "prismShader.ts", "prismDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  reveal: { dir: "packages/ui/src/components/code-reveal", files: ["CodeReveal.tsx", "revealMath.ts", "revealShader.ts", "revealDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  coin: { dir: "packages/ui/src/components/coin", files: ["Coin.tsx", "coinMath.ts", "coinShader.ts", "coinDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  blackhole: { dir: "packages/ui/src/components/black-hole-lens", files: ["BlackHoleLens.tsx", "holeMath.ts", "holeDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  pendulum: { dir: "packages/ui/src/components/chaos-pendulum", files: ["ChaosPendulum.tsx", "pendulumMath.ts", "pendulumDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  fog: { dir: "packages/ui/src/components/fogged-glass", files: ["FoggedGlass.tsx", "fogMath.ts", "sceneDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  banner: { dir: "packages/ui/src/components/cloth-banner", files: ["ClothBanner.tsx", "clothMath.ts", "bannerDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  flap: { dir: "packages/ui/src/components/split-flap-board", files: ["SplitFlapBoard.tsx", "splitFlapMath.ts", "flapWords.ts", "Example.tsx", "README.md", "LICENSE"] },
  mosaic: { dir: "packages/ui/src/components/mosaic-gallery", files: ["MosaicGallery.tsx", "mosaicMath.ts", "mosaic-data.ts", "Example.tsx", "README.md", "LICENSE"] },
  bubbles: { dir: "packages/ui/src/components/bubble-picker", files: ["BubblePicker.tsx", "physicsMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  transitions: { dir: "packages/ui/src/components/gl-transitions", files: ["GLTransitionPager.tsx", "transitionMath.ts", "transitionShaders.ts", "scenes.ts", "Example.tsx", "README.md", "LICENSE"] },
  fold: { dir: "packages/ui/src/components/folded-pass", files: ["FoldedPass.tsx", "foldMath.ts", "passDesign.ts", "Example.tsx", "README.md", "LICENSE"] },
  genie: { dir: "packages/ui/src/components/genie-dismiss", files: ["GenieDismiss.tsx", "genieMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  blossom: { dir: "packages/ui/src/components/blossom-qr", files: ["BlossomQR.tsx", "blossomMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  morph: { dir: "packages/ui/src/components/text-morph", files: ["TextMorph.tsx", "textMorphMath.ts", "scene.ts", "lighthouseText.ts", "Example.tsx", "README.md", "LICENSE"] },
  light: { dir: "packages/ui/src/components/light-painting", files: ["LightPainting.tsx", "lightMath.ts", "paintings.ts", "Example.tsx", "README.md", "LICENSE"] },
  orbit: { dir: "packages/ui/src/components/orbit-qr", files: ["OrbitQR.tsx", "orbitMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  curl: { dir: "packages/ui/src/components/page-curl", files: ["PageCurl.tsx", "curlMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  pinch: { dir: "packages/ui/src/components/pinch-gallery", files: ["PinchGallery.tsx", "pinchLogic.ts", "Example.tsx", "README.md", "LICENSE"] },
  chart: { dir: "packages/ui/src/components/scrub-chart", files: ["ScrubChart.tsx", "chartMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  lens: { dir: "packages/ui/src/components/glass-lens", files: ["GlassLens.tsx", "lensMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  ripple: { dir: "packages/ui/src/components/ripple-reveal", files: ["RippleReveal.tsx", "rippleMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  gooey: { dir: "packages/ui/src/components/gooey-menu", files: ["GooeyMenu.tsx", "gooeyMath.ts", "Example.tsx", "README.md", "LICENSE"] },
  carousel: { dir: "packages/ui/src/components/stacked-carousel", files: ["StackedCarousel.tsx", "carouselLogic.ts", "Example.tsx", "README.md", "LICENSE"] },
  sort: { dir: "packages/ui/src/components/drag-to-sort", files: ["DragToSort.tsx", "sortLogic.ts", "Example.tsx", "README.md", "LICENSE"] },
  glass: { dir: "packages/ui/src/components/liquid-tabs", files: ["LiquidTabs.tsx", "README.md", "LICENSE"] },
  expand: { dir: "packages/ui/src/components/expanding-card", files: ["ExpandingCard.tsx", "expandingLogic.ts", "Example.tsx", "README.md", "LICENSE"] },
  swipe: { dir: "packages/ui/src/components/swipe-row", files: ["SwipeRow.tsx", "swipeLogic.ts", "Example.tsx", "README.md", "LICENSE"] },
  toast: { dir: "packages/ui/src/components/toast-stack", files: ["ToastStack.tsx", "toastLogic.ts", "Example.tsx", "README.md", "LICENSE"] },
  rail: {
    dir: "packages/ui/src/components/preview-rail",
    files: ["PreviewRail.tsx", "selection.ts", "Example.tsx", "README.md", "LICENSE"],
  },
  capsule: {
    dir: "packages/ui/src/components/morph-capsule",
    files: ["MorphCapsule.tsx", "morphMath.ts", "Example.tsx", "README.md", "LICENSE"],
  },
} as const;

function read(dir: string, files: readonly string[]) {
  return files.map((file) => {
    const name = `${dir}/${file}`;
    return { name, code: readFileSync(join(process.cwd(), name), "utf8") };
  });
}

export default function Home() {
  const sources = {
    player: read(components.player.dir, components.player.files),
    path: read(components.path.dir, components.path.files),
    timeline: read(components.timeline.dir, components.timeline.files),
    wheel: read(components.wheel.dir, components.wheel.files),
    range: read(components.range.dir, components.range.files),
    strings: read(components.strings.dir, components.strings.files),
    hourglass: read(components.hourglass.dir, components.hourglass.files),
    prism: read(components.prism.dir, components.prism.files),
    reveal: read(components.reveal.dir, components.reveal.files),
    coin: read(components.coin.dir, components.coin.files),
    blackhole: read(components.blackhole.dir, components.blackhole.files),
    pendulum: read(components.pendulum.dir, components.pendulum.files),
    fog: read(components.fog.dir, components.fog.files),
    banner: read(components.banner.dir, components.banner.files),
    flap: read(components.flap.dir, components.flap.files),
    mosaic: read(components.mosaic.dir, components.mosaic.files),
    bubbles: read(components.bubbles.dir, components.bubbles.files),
    transitions: read(components.transitions.dir, components.transitions.files),
    fold: read(components.fold.dir, components.fold.files),
    genie: read(components.genie.dir, components.genie.files),
    orbit: read(components.orbit.dir, components.orbit.files),
    blossom: read(components.blossom.dir, components.blossom.files),
    morph: read(components.morph.dir, components.morph.files),
    light: read(components.light.dir, components.light.files),
    curl: read(components.curl.dir, components.curl.files),
    pinch: read(components.pinch.dir, components.pinch.files),
    chart: read(components.chart.dir, components.chart.files),
    lens: read(components.lens.dir, components.lens.files),
    ripple: read(components.ripple.dir, components.ripple.files),
    gooey: read(components.gooey.dir, components.gooey.files),
    carousel: read(components.carousel.dir, components.carousel.files),
    sort: read(components.sort.dir, components.sort.files),
    glass: read(components.glass.dir, components.glass.files),
    expand: read(components.expand.dir, components.expand.files),
    swipe: read(components.swipe.dir, components.swipe.files),
    toast: read(components.toast.dir, components.toast.files),
    rail: read(components.rail.dir, components.rail.files),
    capsule: read(components.capsule.dir, components.capsule.files),
  };
  return <NativeletSite sources={sources} />;
}
