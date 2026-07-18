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
- A station can belong to at most six routes.

### Route Inventory

- The current game provides six route slots.
- An empty route slot becomes active when the player connects two stations. Removing all stations from a route makes its slot available again.

### Creating Routes

A new route is created by dragging from one station to another station.

Rules:

- Initial route creation requires two different stations.
- An unused route slot must be available.
- Both stations must have available route capacity.
- A station may appear only once in the route’s station sequence.
- A route may later become circular by connecting one endpoint to the opposite endpoint. Circular closure does not duplicate the starting station in the stored sequence.
- A circular route retains one closure handle at the target station used to close the loop. This handle represents the virtual repeated final station without duplicating it in the stored sequence, so reversing the closure gesture moves the handle to the opposite endpoint.

### Extending Routes

Only a route terminal may be extended.

The player can drag from either terminal to another station. The new station is appended or prepended depending on which terminal was selected.

While dragging, hovering over valid stations can progressively extend the route.

### Retracting and Removing Routes

Dragging a terminal back toward itself or its adjacent station retracts that terminal.

Retracting a circular route’s closure handle first reopens the route without removing the closure target station. The source endpoint used to close the loop becomes active again, and continued retraction removes stored stations from that side in reverse gesture order.

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

No more than three routes may share the same geometric track span. This is a corridor constraint, not a station-capacity constraint: a station may still serve up to six routes when they use different directions. Before creating, extending, closing, inserting into, or reshaping a route, the game tries the normal octilinear bend order and then any alternate diagonal-first or straight-first bend order available for the affected segment or segments. The edit is rejected only when every possible bend order would create a fourth lane along some shared span.

Changes to one route may require recalculating other routes so shared tracks remain consistently spaced.

Terminal cap ports remain stable across layout recalculations. Every incident track direction is reserved at its station, including tracks belonging to terminal routes, so a cap cannot remain on top of another route’s track. A new or moved terminal may claim its preferred least-crowded free port; only an existing terminal directly displaced from that port is reassigned.

Terminal cap additions, removals, and port changes animate as a T-shaped transition: the stem collapses from both ends toward its midpoint and the crossbar collapses from both sides toward its center, then the new terminal expands in reverse. The crossbar remains centered on the stem’s animated outer endpoint so the two thick strokes overlap at the T junction without exposing a gap. Unchanged terminal caps do not animate.

The terminal cap stroke is twice the station border width, and its crossbar length matches the station height.

### Current Input Model

All editing uses the primary pointer button.

- Drag station to station: create a route.
- Drag a route terminal: extend or retract a route.
- Drag a segment onto a station: insert the station.
- Drag a bendable segment through empty space: change its routing preference.
- Release over empty space: cancel the applicable route extension.
- Press Escape: cancel the active interaction.

Pointer previews should reflect the route’s color and should not mutate domain state until an action becomes valid.

Completed or interrupted gestures must not leave a one-station route or a hidden route segment behind. A repeated primary press first cleans up any unfinished interaction.

Normal pointer release, including release outside the canvas, preserves interaction exit animations. True pointer cancellation and window blur may clean up immediately.

Station interaction effects remain presentation-only:

- A station press produces a short, filled circular click splash behind the station using the next available route color. Its radius is twice the original click-splash radius throughout the animation.
- The target station newly added by successful route creation, terminal extension, progressive extension, or segment insertion produces the same filled route-colored splash. Circular closure, reopening, and retraction do not produce this splash.
- A route drag begins only after a small movement threshold and shows a gapless route-colored outline on the starting station. Its stroke width rises from zero to 125% of the station border’s width, settles at 100%, and matches the station’s circle, triangle, or rectangle shape.
- During progressive route building, every newly connected station receives the same zero-to-125%-to-100% outline entrance while all earlier outlines from that gesture remain steady. During retraction, a single outline continues to transfer to the new current terminal.
- When the drag finishes, all retained outlines stay against their stations and animate together from 100% width to 125%, then to zero, without moving outward or separately fading.
- Valid hovered targets receive a smaller route-colored pulse; invalid targets receive no target feedback.
- Completing, cancelling, interrupting, or destroying a gesture cleans up all persistent interaction effects.

## Game Vocabulary

- \*\*Station\*\*: A fixed map node with a shape/type and a world position.
- \*\*Route\*\* or \*\*Line\*\*: An ordered sequence of stations served by one route color.
- \*\*Route endpoint\*\*: The first or last station in a non-circular route.
- \*\*Route handle\*\*: The draggable visual control beyond a route endpoint. The handle edits an existing route; dragging directly from a station begins a new route when allowed.
- \*\*Circular closure handle\*\*: The single draggable terminal-style control at the target station used to close a circular route. It represents the virtual repeated final station and reopens the loop from the original source endpoint when retracted.
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
