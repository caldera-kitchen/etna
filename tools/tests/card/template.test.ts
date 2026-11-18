import { describe, expect, it } from 'vitest';
import { esc, markdownHtml, safeUrl } from '../../src/card/html.ts';
import { fillTemplate, slotNames, usesSlot } from '../../src/card/template.ts';

describe('fillTemplate', () => {
  it('replaces a slot by its content', () => {
    expect(fillTemplate('<h1>{{title}}</h1>', { title: 'Soup' })).toBe('<h1>Soup</h1>');
  });

  it('keeps a block whose slot has content and drops one whose slot is empty', () => {
    const t = 'a{{#notes}}<p>{{notes}}</p>{{/notes}}b';
    expect(fillTemplate(t, { notes: 'N' })).toBe('a<p>N</p>b');
    expect(fillTemplate(t, { notes: '' })).toBe('ab');
    expect(fillTemplate(t, {})).toBe('ab');
  });

  it('resolves blocks nested inside a block of another name', () => {
    const t = '{{#meta}}[{{#yield}}y={{yield}}{{/yield}}{{#source}}s={{source}}{{/source}}]{{/meta}}';
    expect(fillTemplate(t, { meta: '1', yield: '4', source: '' })).toBe('[y=4]');
    expect(fillTemplate(t, { meta: '', yield: '4' })).toBe('');
  });

  it('treats an unknown slot as empty', () => {
    expect(fillTemplate('x{{nope}}y{{#nope}}z{{/nope}}', {})).toBe('xy');
  });

  it('never reads inserted content as template syntax', () => {
    expect(fillTemplate('{{a}}|{{b}}', { a: '{{b}}', b: '{{#a}}x{{/a}}' })).toBe('{{b}}|{{#a}}x{{/a}}');
  });

  it('removes the empty lines a dropped block leaves behind', () => {
    expect(fillTemplate('<div>\n  {{#notes}}\n  <p>{{notes}}</p>\n  {{/notes}}\n</div>\n', {})).toBe('<div>\n</div>\n');
  });

  it('fills dotted label slots, and lists every slot a template uses', () => {
    expect(fillTemplate('<h2>{{label.ingredients}}</h2>{{#label.x}}y{{/label.x}}', { 'label.ingredients': 'Zutaten' })).toBe('<h2>Zutaten</h2>');
    expect(slotNames('{{title}}{{#meta}}{{label.yield}}{{/meta}}{{title}}')).toEqual(['title', 'meta', 'label.yield']);
  });

  it('never reads a slot from the prototype', () => {
    expect(fillTemplate('[{{constructor}}]{{#tostring}}x{{/tostring}}', {})).toBe('[]');
  });

  it('usesSlot sees values and blocks', () => {
    expect(usesSlot('{{components}}', 'components')).toBe(true);
    expect(usesSlot('{{#components}}x{{/components}}', 'components')).toBe(true);
    expect(usesSlot('{{directions}}', 'components')).toBe(false);
  });
});

describe('escaping helpers', () => {
  it('esc covers the five HTML characters', () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('safeUrl allows web, mail, in-page and relative links only', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
    expect(safeUrl('#step')).toBe('#step');
    expect(safeUrl('../other/')).toBe('../other/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('JaVa\tScript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
  });
});

describe('markdownHtml', () => {
  it('renders strong, code and links, and emphasis as plain text (italic is for the chart)', () => {
    expect(markdownHtml('Mix *well* and **fast** with `care`, see [here](https://example.com).')).toBe(
      '<p>Mix well and <strong>fast</strong> with <code>care</code>, see <a href="https://example.com" target="_blank" rel="noopener noreferrer">here</a>.</p>',
    );
  });

  it('prints bold with emphasis bold, either way it nests', () => {
    expect(markdownHtml('on ***medium-low*** heat')).toBe('<p>on <strong>medium-low</strong> heat</p>');
    expect(markdownHtml('**simmer on *medium-low***')).toBe('<p><strong>simmer on medium-low</strong></p>');
    expect(markdownHtml('_low_ and __high__')).toBe('<p>low and <strong>high</strong></p>');
  });

  it('shows raw HTML as text', () => {
    expect(markdownHtml('a <b>bold</b> move')).toBe('<p>a &lt;b&gt;bold&lt;/b&gt; move</p>');
    expect(markdownHtml('<div onclick="x()">block</div>')).toBe('<p>&lt;div onclick=&quot;x()&quot;&gt;block&lt;/div&gt;</p>');
  });

  it('renders lists', () => {
    expect(markdownHtml('- one\n- two')).toBe('<ul class="md-list"><li>one</li><li>two</li></ul>');
  });

  it('gives paragraphs the class asked for', () => {
    expect(markdownHtml('one\n\ntwo', 'direction-text')).toBe('<p class="direction-text">one</p><p class="direction-text">two</p>');
  });

  it('returns nothing for empty source', () => {
    expect(markdownHtml('  \n')).toBe('');
  });
});
