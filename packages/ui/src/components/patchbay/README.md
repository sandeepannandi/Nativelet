# Cable Patchbay

Original React Native component using Skia and Gesture Handler. Drag either plug, let the cable swing under gravity, and reconnect it to an empty reachable socket. A small signal travels along connected cables. Reset, Reroute and Slow motion controls are included. Reroute gives screen readers and keyboard users an alternative to dragging.

Copy CablePatchbay.tsx, cableMath.ts and LICENSE together. Dependencies: React, React Native, @shopify/react-native-skia, react-native-gesture-handler. No assets, network or audio required. The component wraps GestureHandlerRootView. Props: style, slowMotion, reducedMotion.

Each cable has 25 points, a 120 Hz fixed timestep, distance constraints, weak bending resistance, gravity, damping and floor friction. Occupied or unreachable sockets reject a connection. An unconnected plug hangs instead of teleporting to a socket. Cancellation leaves the plug hanging. Native and web use the same solver and scene.

Limits: 2D shaded materials, not 3D cables, knots or cable-to-cable collision. The signal is visual, not an audio or network connection. Physics is an interactive approximation, not measured hardware. Web uses Canvas2D; native uses Skia. Runtime device performance and iOS behavior are not verified. System reduced-motion preference stops the decorative traveling signal; manual cable motion remains interactive.
