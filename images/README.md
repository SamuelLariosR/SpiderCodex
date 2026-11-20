# Visual Assets Directory — Images & Media

This directory (`images/`) stores all graphic assets, diagrams, screenshots, and multimedia displayed across the project's **`README.md`**.

---

## 📸 Asset Inventory & Specifications

| Asset | Format | Purpose in README | Status |
| :--- | :---: | :--- | :---: |
| **`hero-banner.svg`** | SVG / PNG | Header banner showcasing the project title and badges. | ✅ Ready (or replace with your custom banner) |
| **`demo.gif`** *(or video)* | GIF / MP4 / WebM | Animated demonstration of the spider walking, anchoring to words, and shooting silk. | 📌 **Reserved slot for your demo media** |
| **`demo-preview.svg`** | SVG / PNG | Fallback showcase card displayed until you drop your `demo.gif`. | ✅ Ready |
| **`architecture-diagram.svg`** | SVG / PNG | Visual diagram illustrating the ES6 modular software architecture. | ✅ Ready |
| **`kinematics-diagram.svg`** | SVG / PNG | Mathematical and anatomical diagram of the 3D Inverse Kinematics (IK) model. | ✅ Ready |
| **`hud-telemetry.svg`** | SVG / PNG | Visual preview of the HUD telemetry panel and gait indicator. | ✅ Ready |
| **`glitch-preview.svg`** | SVG / PNG | Visual sample card of typographic glitch scrambles and DOM marks. | ✅ Ready |

---

## 🎬 How to Add Your Demo Video or GIF

1. **For Animated GIFs:**
   - Place your file as `demo.gif` in this directory (`images/demo.gif`).
   - The main `README.md` will automatically detect and feature it in the showcase section.

2. **For MP4 / WebM Videos:**
   - Copy your video here (e.g., `images/demo.mp4`).
   - In `README.md`, insert standard HTML video tags:
     ```html
     <p align="center">
       <video src="images/demo.mp4" width="90%" autoplay loop muted playsinline controls></video>
     </p>
     ```

3. **Recommended Dimensions:**
   - Width: `800px` to `1200px`.
   - Dark theme styling fits best with the Arachnopedia cyberpunk palette.
