import { Expression } from '../../../math-json/math-json-format';
import {
  machineValue,
  ROOT,
  NEGATE,
  SUBTRACT,
  ADD,
  MULTIPLY,
  DIVIDE,
  isNumberObject,
  POWER,
  COMPLEX_INFINITY,
  PI,
  EXPONENTIAL_E,
  IMAGINARY_UNIT,
  applyAssociativeOperator,
  rationalValue,
  op,
  nops,
  head,
  op1,
  op2,
  ops,
  symbol,
  subs,
  isEmptySequence,
  missingIfEmpty,
} from '../../../math-json/utils';
import { Serializer, Parser, LatexDictionary } from '../public';
import { getFractionStyle, getRootStyle } from '../serializer-style';
import { joinLatex } from '../tokenizer';

/**
 * If expression is a product, collect all the terms with a
 * negative exponents in the denominator, and all the terms
 * with a positive exponent (or no exponent) in the numerator.
 */
function numeratorDenominator(expr: Expression): [Expression[], Expression[]] {
  if (head(expr) !== 'Multiply') return [[], []];
  const numerator: Expression[] = [];
  const denominator: Expression[] = [];
  const args = ops(expr) ?? [];
  for (const arg of args) {
    if (head(arg) === 'Power') {
      const op1 = op(arg, 1);
      const op2 = op(arg, 2);
      if (head(op2) === 'Negate') {
        const b = op(op2, 1);
        if (op1 && b) denominator.push([POWER, op1, b]);
      } else {
        const exponentVal = machineValue(op2) ?? NaN;
        if (exponentVal === -1) {
          if (op1) denominator.push(op1);
        } else if (exponentVal < 0) {
          if (op1) denominator.push([POWER, op1, -exponentVal]);
        } else {
          numerator.push(arg);
        }
      }
    } else if (head(arg) === 'Rational' && nops(arg) === 2) {
      const op1 = op(arg, 1)!;
      const op2 = op(arg, 2)!;
      if (machineValue(op1) !== 1) numerator.push(op1);
      if (machineValue(op2) !== 1) denominator.push(op2);
    } else {
      const [n, d] = rationalValue(arg);
      if (n !== null) {
        if (n !== 1) numerator.push(n);
        denominator.push(d);
      } else numerator.push(arg);
    }
  }
  return [numerator, denominator];
}

function parseRoot(parser: Parser): Expression | null {
  const degree = parser.matchOptionalLatexArgument();
  const base = parser.matchRequiredLatexArgument();
  if (base === null || isEmptySequence(base)) {
    if (degree !== null)
      return ['Root', ['Error', "'missing'"], missingIfEmpty(degree)];
    return ['Sqrt', ['Error', "'missing'"]];
  }
  if (degree !== null) return ['Root', base, degree];
  return ['Sqrt', base];
}

function serializeRoot(
  serializer: Serializer,
  style: 'radical' | 'quotient' | 'solidus',
  base: Expression | null,
  degree: Expression | null
): string {
  if (base === null) return '\\sqrt{}';
  degree = degree ?? 2;
  if (style === 'solidus') {
    return (
      serializer.wrapShort(base) + '^{1\\/' + serializer.serialize(degree) + '}'
    );
  } else if (style === 'quotient') {
    return (
      serializer.wrapShort(base) +
      '^{\\frac{1}{' +
      serializer.serialize(degree) +
      '}}'
    );
  }

  const degreeValue = machineValue(degree);
  if (degreeValue === 2) return '\\sqrt{' + serializer.serialize(base) + '}';

  // It's the n-th root
  return (
    '\\sqrt[' +
    serializer.serialize(degree) +
    ']{' +
    serializer.serialize(base) +
    '}'
  );
}

function serializeAdd(serializer: Serializer, expr: Expression): string {
  // "add" doesn't increase the "level" for styling purposes
  // so, preventively decrease it now.
  serializer.level -= 1;

  const name = head(expr);
  let result = '';
  let arg = op(expr, 1);
  if (name === NEGATE) {
    result = '-' + serializer.wrap(arg, 276);
  } else if (name === ADD) {
    let val = machineValue(arg) ?? NaN;
    let argWasInteger =
      !Number.isNaN(val) && Number.isInteger(val) && Math.abs(val) <= 1000;
    result = serializer.serialize(arg);
    const last = nops(expr) + 1;
    for (let i = 2; i < last; i++) {
      arg = op(expr, i);
      val = machineValue(arg) ?? NaN;
      const argIsInteger =
        !Number.isNaN(val) && Number.isInteger(val) && Math.abs(val) <= 1000;
      let done = false;
      if (arg !== null && argWasInteger) {
        // Check if we can convert to an invisible plus, e.g. "1\frac{1}{2}"
        // CAUTION: rationalValue() only parses rationals with a
        // denominator and numerator in the machine range.
        // Since we are only considering small fractions with a
        // numerator and denominator of less than 100, that's OK.
        const [numer, denom] = rationalValue(arg);
        if (
          numer !== null &&
          denom !== null &&
          isFinite(numer) &&
          isFinite(denom) &&
          denom > 1 &&
          denom <= 100 &&
          numer > 0 &&
          numer <= 100
        ) {
          // Don't include the '+' sign, it's a rational, use 'invisible plus'
          result = joinLatex([
            result,
            serializer.options.invisiblePlus,
            serializer.serialize(arg),
          ]);
          done = true;
        }
      }
      if (!done) {
        if (val < 0) {
          // Don't include the minus sign, it will be serialized for the arg
          result += serializer.serialize(arg);
        } else if (head(arg) === 'Negate') {
          result += serializer.wrap(arg, 275);
        } else {
          const term = serializer.wrap(arg, 275);
          if (term[0] === '-' || term[0] === '+') result += term;
          else result = result + '+' + term;
        }
      }
      argWasInteger = argIsInteger;
    }
  } else if (name === SUBTRACT) {
    result = serializer.wrap(arg, 275);
    const arg2 = op(expr, 2);
    if (arg2 !== null) {
      const term = serializer.wrap(arg2, 275);
      if (term[0] === '-') result += '+' + term.slice(1);
      else if (term[0] === '+') result += '-' + term.slice(1);
      else result = result + '-' + term;
    }
  }

  // Restore the level
  serializer.level += 1;

  return result;
}

function serializeMultiply(
  serializer: Serializer,
  expr: Expression | null
): string {
  if (expr === null) return '';

  // "Multiply" doesn't increase the "level" for styling purposes
  // so, preventively decrease it now.
  serializer.level -= 1;

  let result = '';

  //
  // Is it a fraction?
  // (i.e. does it have a denominator, i.e. some factors with a negative power)
  //
  const [numer, denom] = numeratorDenominator(expr);
  if (denom.length > 0) {
    if (denom.length === 1 && denom[0] === 1) {
      if (numer.length === 0) result = '1';
      else if (numer.length === 1) result = serializer.serialize(numer[0]);
      else result = serializeMultiply(serializer, [MULTIPLY, ...numer]);
    } else {
      result = serializer.serialize([
        DIVIDE,
        numer.length === 1 ? numer[0] : [MULTIPLY, ...numer],
        denom.length === 1 ? denom[0] : [MULTIPLY, ...denom],
      ]);
    }
  }
  if (result) {
    // Restore the level
    serializer.level += 1;
    return result;
  }

  let isNegative = false;
  let arg: Expression | null = null;
  const count = nops(expr) + 1;
  let prevWasNumber = false;
  for (let i = 1; i < count; i++) {
    arg = op(expr, i);
    if (arg === null) continue;
    let term: string;
    //
    // 1. Should the terms be separated by an explicit MULTIPLY?
    //
    if (typeof arg === 'number' || isNumberObject(arg)) {
      term = serializer.serialize(arg);
      if (term === '-1' && !result) {
        result = '';
        isNegative = !isNegative;
      } else {
        if (term[0] === '-') {
          term = term.slice(1);
          isNegative = !isNegative;
        }
        result = !result
          ? term
          : joinLatex([result, serializer.options.multiply, term]);
      }
      prevWasNumber = true;
      continue;
    }

    if (head(arg) === 'Power') {
      // It's a power with a fractional exponent,
      // it's a nth-root
      const [n, d] = rationalValue(op(arg, 2));
      if (n === 1 && d !== null) {
        result += serializeRoot(
          serializer,
          getRootStyle(arg, serializer.level),
          op(arg, 1),
          d
        );
        prevWasNumber = false;
        continue;
      }
    }

    if (head(arg) === 'Power' && !isNaN(machineValue(op(arg, 1)) ?? NaN)) {
      // It's a power and the base is a number...
      // add a multiply...
      term = serializer.serialize(arg);
      result = !result
        ? term
        : joinLatex([result, serializer.options.multiply, term]);
      prevWasNumber = true;
      continue;
    }

    if (head(arg) === 'Negate') {
      arg = op(arg, 1);
      isNegative = !isNegative;
    }
    // 2.1 Wrap the term if necessary
    // (if it's an operator of precedence less than 390)
    term = serializer.wrap(arg, 390);

    // 2.2. The terms can be separated by an invisible multiply.
    if (!result) {
      // First term
      result = term;
    } else {
      const h = head(arg);
      if (prevWasNumber && (h === 'Divide' || h === 'Rational')) {
        // Can't use an invisible multiply if a number
        // multiplied by a fraction
        result = joinLatex([result, serializer.options.multiply, term]);
      }
      // Not first term, use invisible multiply
      else if (!serializer.options.invisibleMultiply) {
        // Replace, joining the terms correctly
        // i.e. inserting a space between '\pi' and 'x'
        result = joinLatex([result, term]);
      } else {
        result = joinLatex([
          result,
          serializer.options.invisibleMultiply,
          term,
        ]);
      }
    }
    prevWasNumber = false;
  }

  // Restore the level
  serializer.level += 1;

  return isNegative ? '-' + result : result;
}

function parseFraction(parser: Parser): Expression | null {
  const numer = missingIfEmpty(parser.matchRequiredLatexArgument());
  const denom = missingIfEmpty(parser.matchRequiredLatexArgument());
  if (
    head(numer) === 'PartialDerivative' &&
    (head(denom) === 'PartialDerivative' ||
      (head(denom) === 'Multiply' &&
        head(op(denom, 1)) === 'PartialDerivative'))
  ) {
    // It's a Leibniz notation partial derivative
    // `∂f(x)/∂x` or `∂^2f(x)/∂x∂y` or `∂/∂x f(x)`
    const degree = op(numer, 3) ?? null;
    // Expect: getArg(numer, 2) === 'Nothing' -- no args
    let fn = op(numer, 1);
    if (fn === null) fn = missingIfEmpty(parser.matchExpression());

    let vars: Expression[] = [];
    if (head(denom) === 'Multiply') {
      // ?/∂x∂y
      for (const arg of ops(denom) ?? []) {
        if (head(arg) === 'PartialDerivative') {
          const v = op(arg, 2);
          if (v) vars.push(v);
        }
      }
    } else {
      // ?/∂x
      const v = op(denom, 2);
      if (v) vars.push(v);
    }
    if (vars.length > 1) {
      vars = ['List', ...vars];
    }

    return ['PartialDerivative', fn, ...vars, degree === null ? 1 : degree];
  }

  return ['Divide', numer, denom];
}

function serializeFraction(
  serializer: Serializer,
  expr: Expression | null
): string {
  // console.assert(getFunctionName(expr) === DIVIDE);
  if (expr === null) return '';

  const numer = missingIfEmpty(op(expr, 1));
  const denom = missingIfEmpty(op(expr, 2));

  const style = getFractionStyle(expr, serializer.level);
  if (style === 'inline-solidus' || style === 'nice-solidus') {
    const numerStr = serializer.wrapShort(numer);
    const denomStr = serializer.wrapShort(denom);

    if (style === 'inline-solidus') return `${numerStr}\\/${denomStr}`;
    return `^{${numerStr}}\\!\\!/\\!_{${denomStr}}`;
  } else if (style === 'reciprocal') {
    return serializer.wrap(numer) + serializer.wrap(denom) + '^{-1}';
  } else if (style === 'factor') {
    return (
      '\\frac{1}{' + serializer.serialize(denom) + '}' + serializer.wrap(numer)
    );
  }
  // Quotient (default)
  const numerLatex = serializer.serialize(numer);
  const denomLatex = serializer.serialize(denom);
  return `\\frac{${numerLatex}}{${denomLatex}}`;
}

function serializePower(
  serializer: Serializer,
  expr: Expression | null
): string {
  const name = head(expr);
  const arg1 = missingIfEmpty(op(expr, 1));
  const arg2 = missingIfEmpty(op(expr, 2));

  if (name === 'Sqrt') {
    return serializeRoot(
      serializer,
      getRootStyle(expr, serializer.level),
      arg1,
      2
    );
  }
  if (name === 'Root')
    return serializeRoot(
      serializer,
      getRootStyle(expr, serializer.level),
      arg1,
      arg2
    );

  const val2 = machineValue(arg2) ?? 1;
  if (val2 === -1) {
    return serializer.serialize([DIVIDE, '1', arg1]);
  } else if (val2 < 0) {
    return serializer.serialize([DIVIDE, '1', [POWER, arg1, -val2]]);
  } else if (head(arg2) === 'Divide' || head(arg2) === 'Rational') {
    if (machineValue(op(arg2, 1)) === 1) {
      // It's x^{1/n} -> it's a root
      const style = getRootStyle(expr, serializer.level);
      return serializeRoot(serializer, style, arg1, op(arg2, 2));
    }
  } else if (head(arg2) === POWER) {
    if (machineValue(op(arg2, 2)) === -1) {
      // It's x^{n^-1} -> it's a root
      const style = getRootStyle(expr, serializer.level);
      return serializeRoot(serializer, style, arg1, op(arg2, 1));
    }
  }
  return serializer.wrapShort(arg1) + '^{' + serializer.serialize(arg2) + '}';
}

export const DEFINITIONS_ARITHMETIC: LatexDictionary = [
  // Constants
  { name: 'CatalanConstant', serialize: 'G' },
  { name: 'GoldenRatio', serialize: '\\varphi' },
  { name: 'EulerGamma', serialize: '\\gamma' },
  { name: 'Degrees', serialize: '\\frac{\\pi}{180}' },
  {
    trigger: ['\\infty'],
    parse: { num: '+Infinity' },
  },
  {
    name: COMPLEX_INFINITY,
    trigger: ['\\tilde', '\\infty'],
    serialize: '\\tilde\\infty',
  },
  {
    trigger: ['\\tilde', '<{>', '\\infty', '<}>'],
    parse: COMPLEX_INFINITY,
  },
  { name: PI, trigger: ['\\pi'] },
  { trigger: ['π'], parse: 'Pi' },
  { name: EXPONENTIAL_E, trigger: ['e'], serialize: '\\exponentialE' },
  {
    trigger: ['\\mathrm', '<{>', 'e', '<}>'],
    parse: EXPONENTIAL_E,
  },
  {
    trigger: ['\\exponentialE'],
    parse: EXPONENTIAL_E,
  },
  {
    name: IMAGINARY_UNIT,
    trigger: ['\\imaginaryI'],
  },
  {
    trigger: ['i'],
    parse: IMAGINARY_UNIT,
  },
  {
    trigger: ['\\mathrm', '<{>', 'i', '<}>'],
    parse: IMAGINARY_UNIT,
  },

  // Operations
  {
    /** Could be the determinant if the argument is a matrix */
    /** @todo: domain check */
    /** If a literal matrix, the `serialize` should be custom, the parens are
     * replaced with bars */
    name: 'Abs',
    kind: 'matchfix',
    openDelimiter: '|',
    closeDelimiter: '|',
    parse: (_parser, expr) => (isEmptySequence(expr) ? null : ['Abs', expr]),
  },
  {
    name: 'Add',
    trigger: ['+'],
    kind: 'infix',
    associativity: 'both',
    precedence: 275,
    parse: (parser, until, lhs) => {
      if (275 < until.minPrec) return null;

      const rhs = parser.matchExpression({ ...until, minPrec: 275 });
      if (rhs === null) return null;

      return applyAssociativeOperator('Add', lhs, rhs);
    },
    serialize: serializeAdd,
  },
  {
    kind: 'prefix',
    trigger: ['+'],
    precedence: 275,
    parse: (parser, until) => {
      if (275 < until.minPrec) return null;
      return parser.matchExpression({ ...until, minPrec: 400 });
    },
  },
  {
    name: 'Ceil',
    kind: 'matchfix',
    openDelimiter: '\\lceil',
    closeDelimiter: '\\rceil',
  },
  {
    name: 'Complex',
    precedence: 274, // One less than precedence of `Add`: used for correct wrapping
    serialize: (serializer: Serializer, expr: Expression): string => {
      const re = machineValue(op(expr, 1));
      const im = machineValue(op(expr, 2));
      if (im === 0) return serializer.serialize(op(expr, 1));

      const imPart =
        im === 1
          ? '\\imaginaryI'
          : im === -1
          ? '-\\imaginaryI'
          : joinLatex([serializer.serialize(op(expr, 2)), '\\imaginaryI']);
      if (re === 0) return imPart;
      if (im !== null && im < 0)
        return joinLatex([serializer.serialize(op(expr, 1)), imPart]);

      return joinLatex([serializer.serialize(op(expr, 1)), '+', imPart]);
    },
  },
  {
    name: 'Divide',
    trigger: '\\frac',
    precedence: 660,
    // For \frac specifically, not for \div, etc..
    // handles Leibnitz notation for partial derivatives
    parse: parseFraction,
    serialize: serializeFraction,
  },
  {
    kind: 'infix',
    trigger: '\\over',
    precedence: 660,
    parse: 'Divide',
  },
  {
    trigger: ['\\/'],
    kind: 'infix',
    associativity: 'non',
    precedence: 660, // ??? MathML has 265, but it's wrong.
    // It has to be at least higher than multiply
    // e.g. `1/2+3*x` -> `1/2 + 3*x` , not `1/(2+3*x)`
    parse: 'Divide',
  },
  {
    trigger: ['/'],
    kind: 'infix',
    associativity: 'non',
    precedence: 660,
    parse: 'Divide',
  },
  {
    trigger: ['\\div'],
    kind: 'infix',
    associativity: 'non',
    precedence: 660, // ??? according to MathML
    parse: 'Divide',
  },
  {
    name: 'Exp',
    serialize: (serializer: Serializer, expr: Expression): string =>
      joinLatex([
        '\\exponentialE^{',
        serializer.serialize(missingIfEmpty(op(expr, 1))),
        '}',
      ]),
  },
  {
    name: 'Factorial',
    trigger: ['!'],
    kind: 'postfix',
    precedence: 810,
  },
  {
    name: 'Factorial2',
    trigger: ['!', '!'],
    kind: 'postfix',
    precedence: 810,
  },
  {
    name: 'Floor',
    kind: 'matchfix',
    openDelimiter: '\\lfloor',
    closeDelimiter: '\\rfloor',
  },
  {
    trigger: 'floor',
    kind: 'function',
    parse: (parser) => {
      const arg = parser.matchArguments('enclosure');
      return arg === null ? 'Floor' : (['Floor', ...arg] as Expression);
    },
  },
  {
    name: 'Gcd',
    trigger: 'gcd',
    kind: 'function',
  },
  {
    name: 'Half',
    serialize: '\\frac12',
  },
  {
    name: 'Lg',
    serialize: (serializer, expr) =>
      '\\ln_{10}' + serializer.wrapArguments(expr),
  },
  {
    name: 'Lb',
    trigger: '\\lb',
    parse: (parser) => {
      const arg = parser.matchArguments('implicit');
      if (arg === null) return null;
      return ['Log', ...arg, 2] as Expression;
    },
  },
  {
    name: 'Ln',
    serialize: (serializer, expr): string =>
      '\\ln' + serializer.wrapArguments(expr),
  },
  {
    name: 'Log',
    trigger: '\\ln',
    parse: (parser) => {
      let sub: string | null = null;
      let base: number | null = null;
      if (parser.match('_')) {
        sub = parser.matchStringArgument() ?? parser.next();
        base = Number.parseFloat(sub ?? '10');
      }
      const arg = parser.matchArguments('implicit');
      if (arg === null) return null;
      if (base === 10) return ['Lg', ...arg] as Expression;
      if (base === 2) return ['Lb', ...arg] as Expression;
      if (sub === null) return ['Ln', ...arg] as Expression;
      return ['Log', ...arg, sub] as Expression;
    },
    serialize: (serializer, expr): string => {
      const base = op2(expr);
      if (base)
        return joinLatex([
          '\\ln_{',
          base.toString(),
          '}',
          serializer.wrap(op1(expr)),
        ]);
      return '\\ln' + serializer.wrapArguments(expr);
    },
  },

  {
    name: 'Lcm',
    trigger: 'lcm',
    kind: 'function',
  },

  {
    name: 'MinusPlus',
    trigger: ['\\mp'],
    kind: 'infix',
    associativity: 'both',
    precedence: 270,
  },
  {
    name: 'Multiply',
    trigger: ['\\times'],
    kind: 'infix',
    associativity: 'both',
    precedence: 390,
    serialize: serializeMultiply,
  },
  {
    trigger: ['\\cdot'],
    kind: 'infix',
    associativity: 'both',
    precedence: 390,
    parse: (parser, terminator, lhs) => {
      if (391 < terminator.minPrec) return null;
      const rhs = parser.matchExpression({ ...terminator, minPrec: 392 });
      if (rhs === null) return null;

      return applyAssociativeOperator('Multiply', lhs, rhs);
    },
  },
  {
    trigger: ['*'],
    kind: 'infix',
    associativity: 'both',
    precedence: 390,
    parse: (parser, terminator, lhs) => {
      if (391 < terminator.minPrec) return null;
      const rhs = parser.matchExpression({ ...terminator, minPrec: 392 });
      return rhs === null ? null : ['Multiply', lhs, rhs];
    },
  },
  {
    name: 'Negate',
    trigger: ['-'],
    kind: 'prefix',
    parse: (parser, terminator) => {
      if (276 < terminator.minPrec) return null;
      const rhs = parser.matchExpression({ ...terminator, minPrec: 400 });
      return rhs === null ? null : (['Negate', rhs] as Expression);
    },
    precedence: 275,
  },
  // {
  //   /** If the argument is a vector */
  //   /** @todo: domain check */
  //   name: 'Norm',
  //   kind: 'matchfix',
  //   openDelimiter: '|',
  //   closeDelimiter: '|',
  // },
  // {
  //   /** If the argument is a set */
  //   /** @todo: domain check */
  //   name: 'Cardinality',
  //   kind: 'matchfix',
  //   openDelimiter: '|',
  //   closeDelimiter: '|',
  // },
  {
    //   /** If the argument is a vector */
    /** @todo: domain check */
    kind: 'matchfix',
    openDelimiter: '||',
    closeDelimiter: '||',
    parse: (_parser, expr) => (isEmptySequence(expr) ? null : ['Norm', expr]),
  },
  {
    //   /** If the argument is a vector */
    /** @todo: domain check */
    name: 'Norm',
    kind: 'matchfix',
    openDelimiter: ['\\left', '\\Vert'],
    closeDelimiter: ['\\right', '\\Vert'],
  },
  {
    name: 'PlusMinus',
    trigger: ['\\pm'],
    kind: 'infix',
    associativity: 'both',
    precedence: 270,
  },
  {
    name: POWER,
    trigger: ['^'],
    kind: 'infix',
    serialize: serializePower,
  },
  {
    trigger: '\\prod',
    precedence: 265,
    name: 'Product',
    parse: parseBigOp('Product'),
    serialize: serializeBigOp('\\prod'),
  },

  // {
  //   trigger: ['*', '*'],
  //   kind: 'infix',
  //   associativity: 'non',
  //   precedence: 720,
  // },
  {
    name: 'Rational',
    precedence: 660,
    serialize: (serializer: Serializer, expr: Expression | null): string => {
      if (expr && nops(expr) === 1)
        return '\\mathrm{Rational}' + serializer.wrapArguments(expr);
      return serializeFraction(serializer, expr);
    },
  },
  {
    name: ROOT,
    serialize: serializePower,
  },
  {
    name: 'Round',
    trigger: 'round',
    kind: 'function',
  },
  {
    name: 'Square',
    precedence: 720,
    serialize: (serializer, expr) => serializer.wrapShort(op(expr, 1)) + '^2',
  },
  {
    trigger: '\\sum',
    precedence: 265,
    name: 'Sum',
    parse: parseBigOp('Sum'),
    serialize: serializeBigOp('\\sum'),
  },
  {
    name: 'Sign',
    // As per ISO 80000-2, "signum" is 'sgn'
    trigger: 'sgn',
    kind: 'function',
  },
  {
    name: 'Sqrt',
    trigger: ['\\sqrt'],
    parse: parseRoot,
    serialize: serializePower,
  },
  {
    name: 'Subtract',
    trigger: ['-'],
    kind: 'infix',
    associativity: 'both',
    precedence: 275,
    parse: (parser, terminator, lhs) => {
      if (276 < terminator.minPrec) return null;
      const rhs = parser.matchExpression({ ...terminator, minPrec: 277 });
      return rhs === null ? null : (['Subtract', lhs, rhs] as Expression);
    },
  },
];

function parseBigOp(name: string) {
  return (parser: Parser): Expression | null => {
    // Look for sub and sup
    parser.skipSpace();

    let sup: Expression | null = null;
    let sub: Expression | null = null;
    while (!(sub && sup) && (parser.peek === '_' || parser.peek === '^')) {
      if (parser.match('_')) sub = parser.matchRequiredLatexArgument();
      else if (parser.match('^')) sup = parser.matchRequiredLatexArgument();
      parser.skipSpace();
    }

    if (sub === 'Nothing' || isEmptySequence(sub)) sub = null;
    if (sup === 'Nothing' || isEmptySequence(sup)) sup = null;

    let index: Expression | null = null;
    let lower: Expression | null = null;
    if (head(sub) === 'Equal') {
      index = op(sub, 1);
      lower = op(sub, 2);
    } else {
      index = sub;
    }

    const sym = symbol(index);
    // Note: 265 is the precedence for some relational operators
    if (sym)
      parser.computeEngine?.pushScope({
        symbolTable: { symbols: [{ name: sym, domain: 'Integer' }] },
      });
    let fn = parser.matchExpression({ minPrec: 266 });
    if (fn && sym) fn = ['Lambda', subs(fn, { [sym]: '_' })];

    if (sym) parser.computeEngine?.popScope();

    if (!fn) return [name];

    if (sup) return [name, fn, ['Tuple', index ?? 'Nothing', lower ?? 1, sup]];

    if (lower) return [name, fn, ['Tuple', index ?? 'Nothing', lower]];

    if (index) return [name, fn, ['Tuple', index]];

    return [name, fn];
  };
}

function serializeBigOp(command: string) {
  return (serializer, expr) => {
    if (!op(expr, 1)) return command;

    let arg = op(expr, 2);
    const h = head(arg);
    if (h !== 'Tuple' && h !== 'Triple' && h !== 'Pair' && h !== 'Single')
      arg = null;

    const index = op(arg, 1) ?? 'n';

    let fn = op(expr, 1);
    if (head(fn) === 'Lambda' && op(fn, 1))
      fn = subs(op(fn, 1)!, { _: index, _1: index });

    if (!arg) {
      if (!op(expr, 2))
        return joinLatex([command, '_n', serializer.serialize(fn)]);
      return joinLatex([
        command,
        '_{',
        serializer.serialize(op(expr, 2)),
        '}',
        serializer.serialize(fn),
      ]);
    }

    const lower = op(arg, 2);

    let sub: string[] = [];
    if (symbol(index) !== 'Nothing' && lower)
      sub = [serializer.serialize(index), '=', serializer.serialize(lower)];
    else if (symbol(index) !== 'Nothing') sub = [serializer.serialize(index)];
    else if (lower) sub = [serializer.serialize(lower)];

    if (sub.length > 0) sub = ['_{', ...sub, '}'];

    let sup: string[] = [];
    if (op(arg, 3)) sup = ['^{', serializer.serialize(op(arg, 3)), '}'];

    return joinLatex([command, ...sup, ...sub, serializer.serialize(fn)]);
  };
}
