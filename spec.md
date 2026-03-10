# Bike Racing Game

## Current State
New project. No existing code.

## Requested Changes (Diff)

### Add
- 2D side-scrolling bike racing game using Canvas API
- Player controls a motorbike on a road with obstacles
- Scrolling road/background with speed increasing over time
- Obstacles: cars, rocks, potholes appearing randomly
- Score system based on distance traveled
- Lives system (3 lives)
- Speed meter display
- Game states: Start screen, Playing, Game Over
- Keyboard controls: Arrow Left/Right or A/D to dodge, also mobile touch buttons
- Smooth animation using requestAnimationFrame
- High score tracking using localStorage

### Modify
- None

### Remove
- None

## Implementation Plan
1. Create BikeGame React component with Canvas-based rendering
2. Implement game loop with requestAnimationFrame
3. Draw road with lane markings that scroll downward
4. Draw player bike sprite (simple pixel-art style drawn via Canvas)
5. Generate random obstacles (cars, rocks) scrolling from top
6. Collision detection between player bike and obstacles
7. Score and lives HUD overlay
8. Start screen with instructions
9. Game over screen with score and restart option
10. Keyboard and on-screen touch controls
11. Difficulty progression: speed increases over time
12. High score persistence via localStorage
