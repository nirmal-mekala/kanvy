# kanvy

## description

`kanvy` is an opinionated infinite canvas / whiteboarding application written in
React and TypeScript

## status

with the help of agents, we created a prototype of this application that
presently works off of localStorage. we want to clone the applicaiton in its
current state, while improving its underlying architecture a bit. for example,
the prototype was written in JavaScript, but we'd like to adopt TypeScript

**areas of improvement:**

- testing
  - we would like to add first-class unit, component, and e2e test support
  - the spec we align on should inform the tests
- typescript instead of JS
  - strong typing throughout where we currently have a loose implementation
- tailwind
  - i believe the prototype is simply using raw CSS
  - lean toward a pixel-perfect implementation, but pause if it’s looking like
    we need to hack tailwind to death in order to get there
- state management (jotai)
  - this is a big one - at present we have a very thin state management
    approach. we ought to adopt a library. currently, we see very frequent
    re-rendering of the whole canvas when we ar dragging a single node, for
    example. we'd like to clean this up
- best practices surrounding debouncing
- code duplication and organization
  - unsure of extent of issues, but no measures were taken to avoid duplication
- code file length
  - a few files have grown too large and bloated, we need to mvoe toward better
    dev practices to keep things better organized in smaller files
- code linting
  - unsure of status here, but we took a lightweight approach to preserving
    linting
- error handling
  - better UI for errors
  - better handling for e.g. incompatible data etc.
- a11y
  - poor a11y. this was not a major concern of initial pass

**out of scope:**

- feature improvements - we want to preserve functionatliy - warts and all - and
  adjust and improve at a later phase once we have a stable clone

## approach

**phase 1: writing documentation: spec, agents.md**

- major goal - write a spec file
  - source 1: distilled information from claude code chats
  - source 2: developer provides as much context in natural language as possible
  - source 3: source code of original application
  - source 4: developer answers to an agent-generated questionairre
    - claude creates a questionairre based on sources 1 and 2 to further hone in
      on behavior
    - questionairre has exactly twenty-five questions
    - developer fills out questionairre
- secondary goal: agents.md
  - agent uses context to poulate an agents md file

**phase 2: align on schema**

- v0 schema should be fully expressed by end of this phase

**phase 3: align on tooling, config, and stack**

- align on a code health solution + config: lean toward strict, maximalist
  fallow config
- align on linting solution + config: lean toward strict biome config for code
  linting
  - e.g. code complexity
- align on testing frameworks

**phase 4: agent readiness**

- ensure agent has what it needs to succeed
  - primarily concerned about enablign a browser for testing; unsure how this
    will work as this is running in a docker setup
    - ideally, it woudl be possible to run a browser that is visible to
      developer outside the container

**phase 5: agent writes implementation plan**

- based on available context, agent writes implementation plan to complete
  migration

**phase 6: agent builds test suite**

- agent writes a test suite based on all available context

**phase 6: agent builds applicaition**

- based on available context and test suite, agent executes implementation plan
- end of this phase: migration complete, additional features and changes to follow 
