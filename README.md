# WARNING!

This application implements a notebook interface which allows execution
of arbitrary JavaScript code from the notebooks it loads.  If you receive
a notebook from an unknown or untrusted source and load and evaluate it,
you will be excuting JavaScript code from that source.  Beware.

---

# Availability

* [Try it here](https://ed-puckett.github.io/esbook/build/src/index.html)
* [Demos here](https://ed-puckett.github.io/esbook/demos/index.html)
* [Code repository](https://github.com/ed-puckett/esbook)

---

# Stucture of the Notebook

The notebook comprises a single _interaction\_element_ which in turn
comprises zero or more _interaction\_element_ elements.  An _interaction\_element_
is abbreviated as _ie_.

# Interaction Elements

Each ie comprises an input area and an (initially empty) output area.

Text entered into the input area, when evaluated, gives rise to output
in the output area.

The mode of the input area can be either _markup_ or _JavaScript_.

## Markup Mode

The input area is normally in markup mode, and is interpreted as MarkDown
with interspersed LaTeX mathematical expressions delimited by $...$ (inline)
or $$...$$ (display).

Evaluation of an ie whose input area is in markup mode will cause its output area
to be filled with the formatted result.

## JavaScript Mode

If the first non-whitespace characters of the first line of an input area
is "//", then the input area is in JavaScript (i.e., EcmaScript) mode.

Evaluation of an ie whose input area is in JavaScript mode is the result
of evaluated its text as if the text was the body of an async function
which has been applied to arguments.

...

## Expression Evaluation

Within an expression, the "this" object references the eval_state
object of the notebook.  This object persists until the notebook
is opened to a new file or is cleared, at which point it is reset
to an empty object {}.

During evaluation, this.eval_context references an object whose
properties are available directly for evaluation within any
interaction element, without the need to prefix them with any parent
object.  In this sense, this.eval_context acts like a global
environment for the notebook without the need to modify globalThis.

vars(...objects) assigns new properties to this.eval_context.
Those properties then become available "globally".  Note that the
"global" objects are available from any interaction element, that
is until the notebook is opened to a new file or is cleared.
The return value is undefined; this makes ${vars(...)} in a
template literal (and in markup) not insert anything into the output.

Other properties set on the "this" object, like the "global"
properties, persist until the notebook is opened to a new file or
is cleared.  However, those properties must be prefixed by "this."
to reference them.

A return statement within an interaction element terminates the
evaluation and the value of the return statement becomes the result
of the evaluation, and that result will be output.

### Ephemeral eval_context

During evaluation, a number of other values are available "globally",
though these values do not persist after the particular evaluation
(except for references from async code started during the evaluation).
These values include output_context (which provides utilities for
manipulation of the output of the interaction element), various
mathematics interfaces, and various graphics functions and other
functions to manipluate the output.  Also included are:

    println:        prints its argument followed by newline
    printf:         implementation of std C printf()
    sprintf:        implementation of std C sprintf()
    settings:       current settings
    theme_settings: current theme_settings
    formatting:     set formatting { displayAlign, displayIndent }
    import_lib:     import other libraries from the lib/ directory
    vars:           export new "global" properties
    is_stopped:     determine if the evaluation has been stopped
    delay_ms:       return a Promise that resolves after a specified delay
    create_worker:  create a new EvalWorker instance

These all continue to be available even after the evaluation has
returned if there are any async actions still active.
See the method _create_ephemeral_eval_context().
