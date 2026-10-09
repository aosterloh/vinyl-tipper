# Vinyl Tipper 🎵

A minimalist vinyl record appraisal tool and crate recommendation engine.

## Features

- **Album Appraisal**: Drop an album name to instantly get total playtime, track count, and estimated street prices for both new and used pressings in Germany.
- **Direct Store Search Links**: Deep links to German retail and collector marketplaces (`jpc.de`, `HHV.de`, `Amazon.de`, `Discogs`, `eBay.de`, and `Kleinanzeigen`).
- **3 Genre Alternatives**: Hand-curated genre alternatives with genuine cover artwork, playtimes, track counts, and pricing.
- **Progressive Async Streaming**: Immediate display of album core information and progressive loading of market links and artwork.
- **Persistent Favorites ("My Fav Vinyl")**: Heart any album or alternative to save it to your personal crate, persistent across sessions and logouts.
- **Returning Collector Crate**: Memory bank of all past searches; unlocks a vinyl covers carousel once 5 searches are logged.
- **Corporate Google Authentication**: Restricted to corporate `@google.com` accounts via Firebase Auth.
- **Light & Dark Themes**: Responsive, high-contrast themes persisted in local storage.

## Setup & Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/vinyl-tipper.git
   cd vinyl-tipper
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your Google AI Studio Gemini API Key
   ```

3. Start the server (zero dependencies required):
   ```bash
   node server.js
   ```

4. Open `http://localhost:8088` in your browser.
