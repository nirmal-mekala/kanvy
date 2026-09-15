## kanvy

`kanvy` is an opinionated infinite canvas / whiteboarding application written in
React

### layout

- top nav bar
  - LHS: kanvy printed in bold font
  - RHS: (from L to R)
    - visibility UI
      - opens a menu allowing user to select a visiblity mode (modes documented
        elsewhere)
        - standard mode
        - task mode
        - recency mode
    - dark/light toggle
    - upload button
      - allows user to upload a JSON file that overrides current state
    - downlaod button
      - allows user to downlaod board as JSON file
- canvas
  - infinite canvas with dot matrix grid
  - right click to pan around
  - ctrl/cmd zoom to scroll in /out
  - also responds to trackpad pinch to zoom
- bottom controls
  - LHS: help button
    - launches a modal that lists keyboard shortcuts.
    - escape leaves modal
  - RHS: zoom
    - zoom out button
    - zoom indicator - clicking goes to 100%
    - zoom in button

### full HTML of help text

```
<div class="help-panel"><h2 class="help-panel__title">Keyboard shortcuts</h2><table class="help-panel__table"><tbody><tr><td class="help-panel__key">⌘/Ctrl + click + drag</td><td>Create a grouping box</td></tr><tr><td class="help-panel__key">Drag &amp; drop an image file</td><td>Create an image note</td></tr><tr><td class="help-panel__key">Type a URL, then a space</td><td>Convert the note into a link</td></tr><tr><td class="help-panel__key">⌘/Ctrl + V (with an image)</td><td>Paste an image into a focused/selected note, or create a new image note</td></tr><tr><td class="help-panel__key">⌘/Ctrl + V (with a link)</td><td>Paste a link into a focused/selected note, or create a new link note</td></tr><tr><td class="help-panel__key">⌘/Ctrl + Shift + Enter</td><td>Zoom out to fit everything in view</td></tr></tbody></table></div>
```

### image storage

- to make everything ultra portable with a single JSON file, images are stored
  via data URI. they are optimized before storage. stored towards end of JSON to
  help with diffing the file shoudl it be stored (which is an ideal end state)

### node edit menu

- can select a color for any node
  - colors are displayed as is for entity border in normal mode, other UI color
    override in task and recency mode
  - the default color has light/dark mode considerations
  - others are the same for either (per nord)
- groups get the option to have background
- any entity can be converted to a task. it then gets to have its task status
  set. defaults to todo
- when it is a task, the menu gives you the option to give it a todo, blocked, in
  progress, or completed status, with associated colors (todo - neutral hi
  contrast, blocked red, in progress blue, done green)

### dimmed styling

- in certain instances (a node is not a task node and we are in task view mode,
  a node is completed in any view mode) it receives a dimmed styling
  - images whether from link data or from being an image node get a black and
    white and lighten (in lt mode) or darken (in dk mode) treatment
  - text is in a dimmed color

### done styling

- in addition to dimmed styling, task nodes with the done status get their text
  struck through

### edges

- nodes attach to each other at the center of their top, right, bototm, and left
  edges
- max 1 connection between two nodes
- any side can attach to any side
- the app auto assigns a curve given the space between two nodes
- edges can be arrowless or have directional arrows in one or another way

### fonts + colors

- nord color scheme for lt/dk mode
- fira code mono for font.
  - _light_ font weight everywhere but logo
  - google fonts

### node types

- standard text nodes
  - added via pasting text into app or double click
  - fixed width
  - all text is always displayed (grows vertically as text grows)
  - text is not rich
- big text nodes
  - large text that is visible from a birds eye view with some different
    behavior.
  - can alter height and width of big text nodes.
  - expectation is that this has "truncate" behavior by default
  - text is not rich
  - can toggle between big and standard text nodes
    - note: image and link nodes are incompatible with big text. converting a
      big text node to a image node removes the big text quality. same for link
      nodes. image and link nodes dont have big text option
- image node
  - created by pasting an image into the app with nothign selected or pasting an
    image with a node selected or focus on the text node input field
  - image is optimized and converted to data URI
  - fixed width, preserve aspect ratio, grow or shrink vertically
  - with no text, no text area visible when deslected
- link node
  - created by pasting or typeing text into a focused text nod einput field.
    link is "slurped" up
  - metadata is pulled in to display info about the link
  - link text becomes clickable
  - selecting the image of the link still makes the node editable. also is a
    drag handle
  - fixed with, prsere e.g. image that gets pulled in from URL aspect ratios,
    grow or shrink vertically
  - with no text, no text area visible when deslected
- group
  - a "border" around a group of nodes
  - has a background that you can set, svg based with heropatterns
  - backgrounds aligned upon and explicated in code
  - generated via ctrl/cmd click and drag
  - if you drag a group, all items within the group or overlapping at all with
    the group are dragged with it. it creates a behavior where if any item
    contacts a group/border it "sticks" to it

### multi select + bulk editing

- via click and drag, select a shift-drag, and control /commad click, i can
  multi-select entities
  - when i do, i get a single menu in the top right, allowing me to change the
    properties of groups of items

### copy paste behaviors

- pasting a link with nothing selected adds a link node
- pasting a link into the text field of a text node converts it to a link node
  (related to slurp behavior - potential overlap with mechanism of it was literlaly
  typed out)
- pasting an image with nothing selected adds an image node
- pasting an image with a node selected converts it to an image node
- pasting an image with the text input field of a node focused converts it to an
  image node
- i can single select or multi select nodes including groups and copy them with
  keyboard commands. when i paste them, the app automatically places them in a
  neutral area so that they don't get "stuck" to a group. it also pans to that area

### "snap-to" behaviors

- x-direction
  - in the x direction, items snap to the grid.
- y-direction
  - in the y direction, items generally snap to 1-grid length below the above
    item. this allows for easy configuration of grids of items with varying
    heights that may or may not match the grid with a consistent gutter between
    all items
  - groups have a "no drop zone" near their top drag handle, but items can be
    placed above groups

### modes

- standard mode
  - dimming is constrianed to done items
  - colors are preserved
- task mode
  - a node's task determines its color
  - non task items are dimmed
- recency mode
  - a recency of being updated determines its color
