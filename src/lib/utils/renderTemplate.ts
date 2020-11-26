import { compile } from '../hogan/compiler';

// We add all our template helper methods to the template as lambdas. Note
// that lambdas in Mustache are supposed to accept a second argument of
// `render` to get the rendered value, not the literal `{{value}}`. But
// this is currently broken (see https://github.com/twitter/hogan.js/issues/222).
function transformHelpersToHogan(helpers = {}, compileOptions, data) {
  return Object.keys(helpers).reduce(
    (acc, helperKey) => ({
      ...acc,
      [helperKey]() {
        return text => {
          const render = value => compile(value, compileOptions).render(this);

          return helpers[helperKey].call(data, text, render);
        };
      },
    }),
    {}
  );
}

function renderTemplate({
  templates,
  templateKey,
  compileOptions,
  helpers,
  data,
  bindEvent,
}: {
  templates;
  templateKey: string;
  compileOptions;
  helpers;
  data;
  bindEvent;
}) {
  const template = templates[templateKey];

  if (typeof template === 'function') {
    return template(data, bindEvent);
  }

  if (typeof template !== 'string') {
    throw new Error(
      `Template must be 'string' or 'function', was '${typeof template}' (key: ${templateKey})`
    );
  }

  const transformedHelpers = transformHelpersToHogan(
    helpers,
    compileOptions,
    data
  );

  return compile(template, compileOptions)
    .render({
      ...data,
      helpers: transformedHelpers,
    })
    .replace(/[ \n\r\t\f\xA0]+/g, spaces =>
      spaces.replace(/(^|\xA0+)[^\xA0]+/g, '$1 ')
    )
    .trim();
}

export default renderTemplate;
