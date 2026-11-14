// Exercise the public menu, including its enabled state, instead of old toolbar buttons.
export async function libraryMenu({ click, js, until }, label) {
  // Sidebar width/position animates on first mount and when changing viewport mode.
  await new Promise(resolve => setTimeout(resolve, 250));
  await click('.library-menu-trigger');
  const query = `[...document.querySelectorAll('.library-menu .menu-item')].find(el=>new RegExp(${JSON.stringify(label)}).test(el.textContent))`;
  await until(`!!(${query})`, 'Library menu: ' + label).catch(async error => {
    throw Error(error.message + ' ' + await js(`JSON.stringify({menus:[...document.querySelectorAll('.menu-pop')].map(e=>e.outerHTML),trigger:document.querySelector('.library-menu-trigger')?.outerHTML})`));
  });
  await js(`(()=>{const item=${query};if(item.hasAttribute('data-disabled'))throw Error('Disabled Library action');item.click()})()`);
  await until(`!document.querySelector('.library-menu')`, 'Library menu closes');
}
