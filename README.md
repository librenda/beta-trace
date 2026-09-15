# Beta Trace

Centre-of-mass analysis for climbing video, and a map of what video can't see.

## The claim

Coaching tools compare joint angles to a "correct" pose. That's the wrong primitive: there is no
correct pose, and joint angles don't transfer across body proportions. What separates skilled from
unskilled movement is how the **centre of mass** travels — and COM is invisible to the naked eye
but recoverable from ordinary monocular video.

Two things fall out of that:

1. **Measurement.** COM path economy, normalised jerk, wasted sag and static ratio are
   proportion-invariant and computable from a phone clip. Metrics, not vibes.
2. **Credit assignment.** Segmenting the clip into moves lets a climber mark *where the failure
   surfaced* and *where it was actually caused*. The gap between those is a label no sensor
   produces — and it's precisely the label missing from long-horizon robot manipulation data,
   where a policy fails at step 40 because of something it did at step 12.

And the boundary is explicit: grip type and grip force are **not** recoverable here. Pose
estimation gives a wrist, not fingers. That is the same modality gap that limits robot
manipulation datasets — video records that contact happened, never what it cost.

## Run it

Open `index.html` in a browser. Drop in a climbing clip. Nothing uploads; MediaPipe Pose runs
in-browser via WASM.

Best results: side-on camera, whole body in frame, 5–30 seconds, static camera.

## Metrics

| Metric | Meaning | Direction |
|---|---|---|
| Path economy | COM distance ÷ straight-line distance | lower is better (1.0 = perfect line) |
| Normalised jerk | dimensionless smoothness of COM | lower is smoother |
| Wasted sag | downward COM travel ÷ net rise | lower is better |
| Static ratio | share of clip with no limb moving | context — hesitation vs. rest |

All lengths are normalised to torso length (shoulder → hip), so they compare across climbers of
different size.

COM is estimated from 33 pose landmarks using Dempster's body-segment mass fractions.

## The failure taxonomy (parallel track)

`failure_modes.schema.json` is the contract. Fill it from Reddit/forum posts, save the result as
`failure_modes.json` next to `index.html`, and the app picks it up automatically. The app works
without it.

## Honest limitations

- Monocular, so depth and out-of-plane motion are approximate. COM is a 2D projection.
- No force, anywhere. This is deliberate and is the point being made.
- Move segmentation is a velocity-threshold heuristic, not a trained model.
- Reddit attributions are folk causal claims, often wrong. They are a taxonomy source and a
  hypothesis generator, not ground truth.
