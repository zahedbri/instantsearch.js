/*
 *  Copyright 2011 Twitter, Inc.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/* eslint-disable eqeqeq, guard-for-in */

import { Template } from './template';

// Setup regex assignments
// remove whitespace according to Mustache spec
const rIsWhitespace = /\S/;
const rQuot = /"/g;
const rNewline = /\n/g;
const rCr = /\r/g;
const rSlash = /\\/g;
const rLineSep = /\u2028/;
const rParagraphSep = /\u2029/;

const tags = {
  '#': 1,
  '^': 2,
  '<': 3,
  $: 4,
  '/': 5,
  '!': 6,
  '>': 7,
  '=': 8,
  _v: 9,
  '{': 10,
  '&': 11,
  _t: 12,
};

function scan(text, delimiters) {
  const len = text.length;
  const IN_TEXT = 0;
  const IN_TAG_TYPE = 1;
  const IN_TAG = 2;
  let state = IN_TEXT;
  let tagType = null;
  let tag = null;
  let buf = '';
  const tokens = [];
  let seenTag = false;
  let i = 0;
  let lineStart = 0;
  let otag = '{{';
  let ctag = '}}';

  function addBuf() {
    if (buf.length > 0) {
      tokens.push({ tag: '_t', text: buf });
      buf = '';
    }
  }

  function lineIsWhitespace() {
    let isAllWhitespace = true;
    for (let j = lineStart; j < tokens.length; j++) {
      isAllWhitespace =
        tags[tokens[j].tag] < tags._v ||
        (tokens[j].tag === '_t' &&
          tokens[j].text.match(rIsWhitespace) === null);
      if (!isAllWhitespace) {
        return false;
      }
    }

    return isAllWhitespace;
  }

  function filterLine(haveSeenTag, noNewLine) {
    addBuf();

    if (haveSeenTag && lineIsWhitespace()) {
      for (let j = lineStart, next; j < tokens.length; j++) {
        if (tokens[j].text) {
          if ((next = tokens[j + 1]) && next.tag == '>') {
            // set indent to token value
            next.indent = tokens[j].text.toString();
          }
          tokens.splice(j, 1);
        }
      }
    } else if (!noNewLine) {
      tokens.push({ tag: '\n' });
    }

    seenTag = false;
    lineStart = tokens.length;
  }

  function changeDelimiters(string, index) {
    const close = `=${ctag}`;
    const closeIndex = string.indexOf(close, index);
    const newDelimiters = trim(
      string.substring(string.indexOf('=', index) + 1, closeIndex)
    ).split(' ');

    otag = newDelimiters[0];
    ctag = newDelimiters[newDelimiters.length - 1];

    return closeIndex + close.length - 1;
  }

  if (delimiters) {
    const newDelimiters = delimiters.split(' ');
    otag = newDelimiters[0];
    ctag = newDelimiters[1];
  }

  for (i = 0; i < len; i++) {
    if (state == IN_TEXT) {
      if (tagChange(otag, text, i)) {
        --i;
        addBuf();
        state = IN_TAG_TYPE;
      } else if (text.charAt(i) == '\n') {
        filterLine(seenTag);
      } else {
        buf += text.charAt(i);
      }
    } else if (state == IN_TAG_TYPE) {
      i += otag.length - 1;
      tag = tags[text.charAt(i + 1)];
      tagType = tag ? text.charAt(i + 1) : '_v';
      if (tagType == '=') {
        i = changeDelimiters(text, i);
        state = IN_TEXT;
      } else {
        if (tag) {
          i++;
        }
        state = IN_TAG;
      }
      seenTag = i;
    } else if (tagChange(ctag, text, i)) {
      tokens.push({
        tag: tagType,
        n: trim(buf),
        otag,
        ctag,
        i: tagType == '/' ? seenTag - otag.length : i + ctag.length,
      });
      buf = '';
      i += ctag.length - 1;
      state = IN_TEXT;
      if (tagType == '{') {
        if (ctag == '}}') {
          i++;
        } else {
          cleanTripleStache(tokens[tokens.length - 1]);
        }
      }
    } else {
      buf += text.charAt(i);
    }
  }

  filterLine(seenTag, true);

  return tokens;
}

function cleanTripleStache(token) {
  if (token.n.substr(token.n.length - 1) === '}') {
    token.n = token.n.substring(0, token.n.length - 1);
  }
}

function trim(s) {
  if (s.trim) {
    return s.trim();
  }

  return s.replace(/^\s*|\s*$/g, '');
}

function tagChange(tag, text, index) {
  if (text.charAt(index) != tag.charAt(0)) {
    return false;
  }

  for (let i = 1, l = tag.length; i < l; i++) {
    if (text.charAt(index + i) != tag.charAt(i)) {
      return false;
    }
  }

  return true;
}

// the tags allowed inside super templates
const allowedInSuper = { _t: true, '\n': true, $: true, '/': true };

function buildTree(tokens, kind, stack, customTags) {
  const instructions = [];
  let opener = null;
  let tail = null;
  let token = null;

  tail = stack[stack.length - 1];

  while (tokens.length > 0) {
    token = tokens.shift();

    if (tail && tail.tag == '<' && !(token.tag in allowedInSuper)) {
      throw new Error('Illegal content in < super tag.');
    }

    if (tags[token.tag] <= tags.$ || isOpener(token, customTags)) {
      stack.push(token);
      token.nodes = buildTree(tokens, token.tag, stack, customTags);
    } else if (token.tag == '/') {
      if (stack.length === 0) {
        throw new Error(`Closing tag without opener: /${token.n}`);
      }
      opener = stack.pop();
      if (token.n != opener.n && !isCloser(token.n, opener.n, customTags)) {
        throw new Error(`Nesting error: ${opener.n} vs. ${token.n}`);
      }
      opener.end = token.i;
      return instructions;
    } else if (token.tag == '\n') {
      token.last = tokens.length == 0 || tokens[0].tag == '\n';
    }

    instructions.push(token);
  }

  if (stack.length > 0) {
    throw new Error(`missing closing tag: ${stack.pop().n}`);
  }

  return instructions;
}

function isOpener(token, tagList) {
  for (let i = 0, l = tagList.length; i < l; i++) {
    if (tagList[i].o == token.n) {
      token.tag = '#';
      return true;
    }
  }
  return false;
}

function isCloser(close, open, tagList) {
  for (let i = 0, l = tagList.length; i < l; i++) {
    if (tagList[i].c == close && tagList[i].o == open) {
      return true;
    }
  }
  return false;
}

function stringifySubstitutions(obj) {
  const items = [];
  for (const key in obj) {
    items.push(`"${esc(key)}": function(c,p,t,i) {${obj[key]}}`);
  }
  return `{ ${items.join(',')} }`;
}

function stringifyPartials(codeObj) {
  const partials = [];
  for (const key in codeObj.partials) {
    partials.push(
      `"${esc(key)}":{name:"${esc(
        codeObj.partials[key].name
      )}", ${stringifyPartials(codeObj.partials[key])}}`
    );
  }
  return `partials: {${partials.join(',')}}, subs: ${stringifySubstitutions(
    codeObj.subs
  )}`;
}

function stringify(codeObj) {
  return `{code: function (c,p,i) { ${wrapMain(
    codeObj.code
  )} },${stringifyPartials(codeObj)}}`;
}

let serialNo = 0;
function generate(tree, text, options) {
  serialNo = 0;
  const context = { code: '', subs: {}, partials: {} };
  walk(tree, context);

  if (options.asString) {
    return stringify(context, text, options);
  }

  return makeTemplate(context, text, options);
}

function wrapMain(code) {
  return `var t=this;t.b(i=i||"");${code}return t.fl();`;
}

function makeTemplate(codeObj, text, options) {
  const template = makePartials(codeObj);

  // @TODO: prevent using this
  // eslint-disable-next-line no-new-func
  template.code = new Function('c', 'p', 'i', wrapMain(codeObj.code));
  return new Template(template, text, compile, options);
}

function makePartials(codeObj) {
  let key;
  const template = { subs: {}, partials: codeObj.partials, name: codeObj.name };
  for (key in template.partials) {
    template.partials[key] = makePartials(template.partials[key]);
  }
  for (key in codeObj.subs) {
    // @TODO: prevent using this
    // eslint-disable-next-line no-new-func
    template.subs[key] = new Function('c', 'p', 't', 'i', codeObj.subs[key]);
  }
  return template;
}

function esc(s) {
  return s
    .replace(rSlash, '\\\\')
    .replace(rQuot, '\\"')
    .replace(rNewline, '\\n')
    .replace(rCr, '\\r')
    .replace(rLineSep, '\\u2028')
    .replace(rParagraphSep, '\\u2029');
}

function chooseMethod(s) {
  return s.indexOf('.') !== -1 ? 'd' : 'f';
}

function createPartial(node, context) {
  const prefix = `<${context.prefix || ''}`;
  const sym = prefix + node.n + serialNo++;
  context.partials[sym] = { name: node.n, partials: {} };
  context.code += `t.b(t.rp("${esc(sym)}",c,p,"${node.indent || ''}"));`;
  return sym;
}

const codegen = {
  '#'(node, context) {
    context.code +=
      `if(t.s(t.${chooseMethod(node.n)}("${esc(node.n)}",c,p,1),` +
      `c,p,0,${node.i},${node.end},"${node.otag} ${node.ctag}")){` +
      `t.rs(c,p,` +
      `function(c,p,t){`;
    walk(node.nodes, context);
    context.code += '});c.pop();}';
  },

  '^'(node, context) {
    context.code += `if(!t.s(t.${chooseMethod(node.n)}("${esc(
      node.n
    )}",c,p,1),c,p,1,0,0,"")){`;
    walk(node.nodes, context);
    context.code += '};';
  },

  '>': createPartial,
  '<'(node, context) {
    const ctx = { partials: {}, code: '', subs: {}, inPartial: true };
    walk(node.nodes, ctx);
    const template = context.partials[createPartial(node, context)];
    template.subs = ctx.subs;
    template.partials = ctx.partials;
  },

  $(node, context) {
    const ctx = {
      subs: {},
      code: '',
      partials: context.partials,
      prefix: node.n,
    };
    walk(node.nodes, ctx);
    context.subs[node.n] = ctx.code;
    if (!context.inPartial) {
      context.code += `t.sub("${esc(node.n)}",c,p,i);`;
    }
  },

  '\n'(node, context) {
    context.code += write(`"\\n"${node.last ? '' : ' + i'}`);
  },

  _v(node, context) {
    context.code += `t.b(t.v(t.${chooseMethod(node.n)}("${esc(
      node.n
    )}",c,p,0)));`;
  },

  _t(node, context) {
    context.code += write(`"${esc(node.text)}"`);
  },

  '{': tripleStache,

  '&': tripleStache,
};

function tripleStache(node, context) {
  context.code += `t.b(t.t(t.${chooseMethod(node.n)}("${esc(
    node.n
  )}",c,p,0)));`;
}

function write(s) {
  return `t.b(${s});`;
}

function walk(nodelist, context) {
  let func;
  for (let i = 0, l = nodelist.length; i < l; i++) {
    func = codegen[nodelist[i].tag];
    if (func) {
      func(nodelist[i], context);
    }
  }
  return context;
}

function parse(tokens, options) {
  options = options || {};
  return buildTree(tokens, '', [], options.sectionTags || []);
}

const cache = {};

function cacheKey(text, options) {
  return [
    text,
    Boolean(options.asString),
    Boolean(options.disableLambda),
    options.delimiters,
    Boolean(options.modelGet),
  ].join('||');
}

export function compile(text, options) {
  options = options || {};
  const key = cacheKey(text, options);
  let template = cache[key];

  if (template) {
    const partials = template.partials;
    for (const name in partials) {
      delete partials[name].instance;
    }
    return template;
  }

  template = generate(
    parse(scan(text, options.delimiters), options),
    text,
    options
  );

  cache[key] = template;

  return cache[key];
}
