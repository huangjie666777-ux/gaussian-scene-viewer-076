# Guitar scene

Source: https://github.com/playcanvas/engine/blob/55ce8a4a6a5ac850f1b9a51d28bce36c8a1b6a6b/examples/assets/splats/guitar.compressed.ply

Source repository license: MIT, copyright PlayCanvas Ltd. The original license is included as PLAYCANVAS-LICENSE.txt.

This asset was converted with @playcanvas/splat-transform3.8.0 to uncompressed PLY, then to the 32-byte .splat representation. It contains 90854 Gaussian primitives. Positions were retained; logarithmic scales, opacity logits and degree-zero spherical-harmonic color were decoded. No renderer source is included.

File: guitar.splat
SHA256: 7fdbf0a718e5e842bd4555c8ca71d623d6ffb2be8fc4f5bdeba91f3566182876

The file stores little-endian float32 x/y/z, positive scale x/y/z, unsigned-byte R/G/B/alpha and unsigned-byte quaternion w/x/y/z. Quaternion decoding is byte minus128, divided by128, then normalized. The asset has fixed RGB colors and no higher-order spherical harmonics.
