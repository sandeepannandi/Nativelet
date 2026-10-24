<p align="center">
  <img src="public/icon.svg" alt="Nativelet icon" width="84" />
</p>


<h1 align="center">Nativelet</h1>


<p align="center">
  Open-source React Native interaction components.<br />
  <a href="https://nativelet.netlify.app/">nativelet.netlify.app</a>
</p>


---


Nativelet is a growing collection of gesture- and physics-driven components for React Native and Expo, built with Reanimated and Skia. Each component ships as real React Native source you can copy into your own app, with a live preview and copyable code on the website.


## Components

- Mini Player: drag a mini player bar into a full now-playing screen - artwork morphs, waveform scrubs, release velocity decides.
- Timeline Trim: pinch-zoomable waveform ruler, trim handles and a source-time playhead.


Preview Rail · Morph Capsule · Toast Stack · Liquid Tabs · Swipe Row · Expanding Card · Drag to Sort · Stacked Carousel · Gooey Menu · Theme Reveal · Glass Lens · Scrub Chart · Pinch Gallery · Page Curl · Orbit QR · Blossom QR · Light on Painting · Text Morph · Genie Dismiss · Folded Pass · GL Transitions · Bubble Picker · Mosaic Gallery · Split-Flap Board · Cloth Banner · Fogged Glass · Chaos Pendulum · Black Hole Lens · Coin · Code Reveal · Prism · Sand Hourglass · Plucked Strings · Range Stack · Wheel Time Picker · Signature Ink


## Use a component


Every component lives in [`packages/ui/src/components`](packages/ui/src/components) with its source, an example, a README, a license file and its dependency list. Copy the folder into an Expo app, or copy the code from the component's card on the [website](https://nativelet.netlify.app/).


## Run the showcase app


```bash
cd apps/showcase
npm install
npx expo start
```


## Notes


- The website previews are web stand-ins for the native render, not screenshots of it.
- Tested on Android and iOS.


## License


[MIT](LICENSE)
