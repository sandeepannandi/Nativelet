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

- Roulette Wheel: a lit 3D roulette wheel with a chrome ball; tap to spin or drag to set the launch speed, and the ball circles the lacquered track, spirals in, drops past the brass deflectors onto the turning rotor, hops between the frets and settles in a pocket.
- Snow Globe: shake or drag a glass globe and a blizzard swirls through the water, then settles flake by flake onto a snowy cottage scene; the water lags the glass, flakes sink at Stokes speeds and the loosest lift first.
- Origami Fold: a sheet of two-sided paper you fold freely. Press anywhere and drag in any direction; the crease sits halfway between your grab point and your finger, the flap lifts and swings over in 3D, and folds stack, undo and reset.
- 3D Dice Tray: pick up casino dice, flick them across a felt tray and watch real rigid-body physics tumble, bounce off the rails, knock into each other and settle on a face.
- Burn Dismiss: touch a postcard to ignite it - a noise-warped burn front with a glowing edge eats the paper, embers rise, ash flutters down; hold to feed the fire, restore to rewind it.
- Cable Patchbay: unplug either end of a weighted cable, let it swing, and reconnect to an empty socket. Gravity, bending, socket capture and a visual signal, with slow motion.


- Slingshot: drag the pouch back to stretch the rubber band, aim by the dotted path and release - the ball rides the spring, flies, bounces and the slack band wobbles, slow motion included.
- Pottery Wheel: drag across a spinning lump of wet clay to press it in or pull it out - every slice keeps its volume, the rim wobbles and settles.
- Newton's Cradle: pull back one chrome ball or a pair and release - momentum clicks through the line and the same count swings out, with real pendulum dynamics and gradual energy loss.
- Voice Recorder: hold the mic to record a voice note - live waveform, slide left to cancel, drag up to lock, release to send a playable pill.
- Glass Shatter: tap a glass pane and it breaks into about 360 shards that fall, spin and collide with real polygon contact.
- Paper Crumple: crumple a sheet of paper into a creased ball with a corner drag or pinch, flick it to roll and bounce, smooth it back open.
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
