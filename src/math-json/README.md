<div align="center">
    <img alt="math live" src="../../assets/math-json.jpg?raw=true">
</div>

<h3><strong>LaTeX Syntax</strong></h3>
<h1>Parse and Serialize MathJSON</h1>

| LaTeX                      | MathJSON                                                                  |
| :------------------------- | :------------------------------------------------------------------------ |
| `\frac{a}{1+x}`            | `["Divide", "a", ["Add", 1, "x"]]`                                        |
| `e^{\imaginaryI \pi }+1=0` | `["Eq", ["Power", "E", ["Add", ["Multiply", "Pi", "ImaginaryI"], 1]], 0]` |
| `\sin^{-1}\prime(x)`       | `[["Derivative", 1, ["InverseFunction", "Sin"]], "x"]`                    |

This section of the repo contains code to:

- parse LaTeX to MathJSON
- serialize MathJSON to LaTeX

Reference documentation and guides at
[cortexjs.io/math-json](https://cortexjs.io/math-json/).

## Using the LaTeX Parser/Serializer

```bash
$ npm install --save @cortex-js/compute-engine
```

```js
import { parse, serialize } from '@cortex-js/compute-engine';

console.log(parse('\\frac{\\pi}{2}'));
// ➔ ["Divide", "Pi", 2]

console.log(serialize([["InverseFunction", "Sin"], "x"));
// ➔ \sin^{-1}x

```

# More

- [MathJSON format](https://cortexjs.io/math-json/)
- [MathJSON Dictionaries](https://cortexjs.io/compute-engine/dictionaries/)

## Related Projects

<dl>
  <dt><a href="https://cortexjs.io/mathlive">MathLive</a> (on <a href="https://github.com/arnog/mathlive">GitHub</a>)</dt>
  <dd>A Web Component for math input.</dd>  
  <dt><a href="https://cortexjs.io/compute-engine">Compute Engine</a> (on <a href="https://github.com/cortex-js/compute-engine/tree/master/src/compute-engine">GitHub</a>)</dt>
  <dd>The CortexJS Compute Engine performs calculations on MathJSON expressions</dd>  
  <dt><a href="https://cortexjs.io/cortex">Cortex</a> (on <a href="https://github.com/cortex-js/compute-engine/tree/master/src/cortex">GitHub</a>)</dt>
  <dd>A programming language for scientific computing</dd>  
</dl>
