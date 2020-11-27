import { TemplateWithBindEvent } from '../../types';
import { compile } from '../hogan/compiler';
import { CompileOptions } from '../hogan/types';
import { BindEventForHits } from './createSendEventForHits';

// We add all our template helper methods to the template as lambdas. Note
// that lambdas in Mustache are supposed to accept a second argument of
// `render` to get the rendered value, not the literal `{{value}}`. But
// this is currently broken (see https://github.com/twitter/hogan.js/issues/222).
function transformHelpersToHogan<TTemplateData>(
  helpers = {},
  compileOptions: CompileOptions,
  data: TTemplateData
) {
  return Object.keys(helpers).reduce(
    (acc, helperKey) => ({
      ...acc,
      [helperKey]() {
        return (text: string) => {
          const render = (value: string) =>
            compile(value, compileOptions).render(this);

          return helpers[helperKey].call(data, text, render);
        };
      },
    }),
    {}
  );
}

function renderTemplate<TTemplateData = void>({
  templates,
  templateKey,
  compileOptions,
  helpers,
  data,
  bindEvent,
}: {
  templates: { [key: string]: TemplateWithBindEvent<TTemplateData> };
  templateKey: string;
  compileOptions: CompileOptions;
  helpers;
  data: TTemplateData;
  bindEvent: BindEventForHits;
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
