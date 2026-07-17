# MiniMetro — Agent Guide

## Project Overview

MiniMetro is a browser-based, Mini Metro-inspired route-building game written in TypeScript and rendered with PixiJS.

## Agent Personal Instruction

In case team asks something that does not follow any of following sections/decisions, ask whether they actually want to proceed and change this sections/decisions!

## Technology

- TypeScript with strict compiler settings.
- PixiJS for rendering and pointer input.
- Vite for development and production builds.
- No UI framework.
- No automated test framework is currently configured.

## Current Game Mechancis

### Stations

- A unique ID.
- A fixed world position.
- A shape: circle, triangle, or rectangle.
- A station can belong to at most three routes.

### Route Inventory

- An empty route slot becomes active when the player connects two stations. Removing all stations from a route makes its slot available again.

### Creating Routes

A new route is created by dragging from one station to another station.

Rules:

- Initial route creation requires two different stations.
- An unused route slot must be available.
- Both stations must have available route capacity.
- A station may appear only once in the route’s station sequence.
- A route may later become circular by connecting one endpoint to the opposite endpoint. Circular closure does not duplicate the starting station in the stored sequence.

### Extending Routes

Only a route terminal may be extended.

The player can drag from either terminal to another station. The new station is appended or prepended depending on which terminal was selected.

While dragging, hovering over valid stations can progressively extend the route.

### Retracting and Removing Routes

Dragging a terminal back toward itself or its adjacent station retracts that terminal.

Only terminal stations can currently be removed. Removing a station from the middle of a route is not supported.

If every station is removed, the route is cleared and its color becomes available for reuse.

### Inserting Stations

Dragging an existing route segment onto a station inserts that station between the segment’s two endpoints.

The station must not already belong to the route and must have available route capacity.

### Segment Shape Editing

Routes use octilinear geometry:

- Horizontal
- Vertical
- 45-degree diagonal

When two stations cannot be joined with one octilinear span, the segment receives a bend.

Dragging a segment without dropping it on a station selects between:

- Diagonal-first routing.
- Straight-first routing.

Explicit routing preferences should survive later route edits whenever their station pair still exists.

### Overlapping Routes

When multiple routes share track geometry, the layout system assigns separate visual lanes.

Changes to one route may require recalculating other routes so shared tracks remain consistently spaced.

### Current Input Model

All editing uses the primary pointer button.

- Drag station to station: create a route.
- Drag a route terminal: extend or retract a route.
- Drag a segment onto a station: insert the station.
- Drag a bendable segment through empty space: change its routing preference.
- Release over empty space: cancel the applicable route extension.
- Press Escape: cancel the active interaction.

Pointer previews should reflect the route’s color and should not mutate domain state until an action becomes valid.

## Game Vocabulary

- \*\*Station\*\*: A fixed map node with a shape/type and a world position.
- \*\*Route\*\* or \*\*Line\*\*: An ordered sequence of stations served by one route color.
- \*\*Route endpoint\*\*: The first or last station in a non-circular route.
- \*\*Route handle\*\*: The draggable visual control beyond a route endpoint. The handle edits an existing route; dragging directly from a station begins a new route when allowed.
- \*\*Segment\*\*: A connection between two adjacent stations in a route.
- \*\*Circular route\*\*: A route whose final station connects back to its first station.
- \*\*Passenger\*\*: An entity waiting at a station with a destination station type.
- \*\*Train\*\*: A vehicle assigned to one route that travels between adjacent route stations.
- \*\*Route slot\*\*: An available line/color the player owns. A slot may exist without being active on the map.
- \*\*Command\*\*: A requested state change, such as extending or shortening a route.
- \*\*Domain event\*\*: A fact emitted after a valid state change, such as \`RouteExtended\`.

Use one term consistently in code. Do not mix \`Route\` and \`Line\` for the same domain concept unless adapting an external API.

## Architecture Boundaries

Keep these responsibilities distinct even if the folder names differ:

### Domain

Contains pure game concepts and rules: stations, routes, trains, passengers, IDs, invariants, commands/results, and domain events. It must not import PixiJS, DOM APIs, or Vite environment variables.

### Application / game engine

Coordinates use cases and simulation systems: route commands, ticking, spawning, movement, journey planning, resource inventory, scoring, and event publication. It owns sequencing, not drawing.

### Presentation

PixiJS views, layers, input interpretation, previews, animation, and HUD. Views render state and translate pointer gestures into commands. They do not directly mutate route arrays or simulation entities.

### Infrastructure / composition root

Creates the PixiJS application, wires dependencies, selects production/development adapters, and owns lifecycle/disposal. Environment-based debug behavior belongs here.

Infrastructure may construct all layers. Domain must not depend outward.

## Coding Rules for Agents

- Inspect the relevant call path before editing; do not patch only the visible symptom.
- State the player-facing behavior being preserved or changed.
- Prefer focused changes over repository-wide rewrites.
- Preserve public APIs unless changing them is necessary for the requested behavior.
- Use descriptive domain names and stable entity IDs. Avoid exposing mutable arrays/collections.
- Keep constructors valid and lightweight; use methods or factories when creation has meaningful validation.
- Avoid generic \`Manager\`, \`Helper\`, or \`Utils\` classes when a precise responsibility can be named.
- Do not introduce abstractions solely for hypothetical future games or engines.
- Do not couple domain entities to event emitters merely to share boilerplate.
- Never use PixiJS object identity as domain identity.
- Do not mutate domain state during rendering.
- Do not silently change a specified interaction because another implementation is easier.
- When requirements are ambiguous and materially affect player behavior, ask before choosing. For small internal details, choose the simplest deterministic option and document the assumption.
