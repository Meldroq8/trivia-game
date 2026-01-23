# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rasbras (راس براس) is an Arabic team trivia game built with React 19, Vite 7, and Firebase. Teams compete in trivia categories with power-ups (perks) and mini-games. The app uses RTL layout for Arabic text.

## Commands

```bash
npm run dev          # Dev server with HMR (default port 5173)
npm run dev:host     # Dev server accessible from network
npm run dev:https    # HTTPS dev server
npm run build        # Production build
npm run lint         # ESLint check
npm run preview      # Preview production build
```

## Architecture

### Tech Stack
- **Frontend:** React 19 + Vite 7 + React Router 7
- **Styling:** Tailwind CSS with RTL support
- **Backend:** Firebase (Auth, Firestore, Cloud Storage)
- **AI:** Google GenAI API (admin question generation)

### State Management
The app uses React hooks with prop drilling through `App.jsx`, not Redux. Game state is managed centrally in App.jsx and passed down through route props.

### Multi-Level Caching Strategy
```
Memory Cache (module-level, survives remounts)
    ↓
LocalStorage Cache (24-hour TTL)
    ↓
Firebase Firestore (source of truth)
```

Key caching files:
- `src/utils/gameDataLoader.js` - Memory caching for categories/questions
- `src/utils/questionUsageTracker.js` - Tracks per-user question usage to prevent repeats

### Game Flow
```
Index → CategorySelection → GameBoard → QuestionView → Results
                                ↑______________|
```

### Code Splitting
- Admin page (`src/pages/Admin.jsx`, ~422KB) is lazy loaded
- AI services in separate chunk
- Firebase in separate vendor chunk

### Key Directories
- `src/pages/` - Route page components
- `src/components/` - Reusable UI components
- `src/hooks/` - Custom React hooks (useAuth, usePresentationMode, etc.)
- `src/firebase/` - Firebase config and services
- `src/services/` - Business logic (verification, mini-games, AI)
- `src/utils/` - Helpers and data processing

### Important Files
- `src/App.jsx` - Central router and game state management
- `src/firebase/authService.js` - Auth + database operations
- `src/utils/gameDataLoader.js` - Caching strategy implementation
- `src/utils/questionUsageTracker.js` - Question repeat prevention
- `src/pages/QuestionView.jsx` - Question display with perk logic

### Service Worker
Auto-update system in `main.jsx` checks `version.json` at intervals. Updates apply silently when user is on home page, not during active gameplay.

### Firebase App Check
reCAPTCHA Enterprise integration in `firebase/config.js` prevents unauthorized API access. Required before Firestore operations.

## Patterns

- Use `devLog()` from `src/utils/devLog.js` instead of `console.log()` (stripped in production)
- Game state resets on category selection by design
- Memory cache invalidates on category change
- RTL layout requires `dir="rtl"` on HTML element
