// 仅开发版启用微信调试模式，配合开发工具 urlCheck:false 调试局域网接口。
// 体验版、正式版和无法识别版本的环境绝不自动启用。
module.exports = function enableDevelopmentDebug(api) {
  try {
    if (!api || typeof api.getAccountInfoSync !== 'function' || typeof api.setEnableDebug !== 'function') return false;
    const account = api.getAccountInfoSync();
    if (!account.miniProgram || account.miniProgram.envVersion !== 'develop') return false;
    api.setEnableDebug({
      enableDebug: true,
      fail() { console.warn('未能自动开启开发调试，请在微信小程序菜单中手动打开调试模式。'); }
    });
    return true;
  } catch (_) {
    return false;
  }
};
