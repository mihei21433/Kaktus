/**
 * Личный код входа, только что выданный сервером. Держим в памяти до показа на экране «Ваш код входа»,
 * не в адресе страницы: в веб-версии адрес попадает в историю браузера.
 */
let fresh: string | null = null;
export const setFreshCode = (c: string | null) => {
  fresh = c;
};
export const takeFreshCode = () => {
  const c = fresh;
  fresh = null;
  return c;
};
