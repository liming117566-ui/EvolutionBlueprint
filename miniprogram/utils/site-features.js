const api = require('./api');

const defaults = { printing: { enabled: true, dealerId: '' }, announcement: null };

async function load() {
  try {
    const { printing, announcement } = await api.request('/api/site-features', { auth: false });
    return {
      printing: printing && typeof printing.enabled === 'boolean' ? printing : defaults.printing,
      announcement: announcement && typeof announcement.title === 'string' && typeof announcement.html === 'string' ? announcement : null
    };
  } catch (_) {
    return defaults;
  }
}

module.exports = { defaults, load };
