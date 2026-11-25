// Дополняет app.json тем, что зависит от файлов на компьютере сборки.
// google-services.json (Firebase) нужен только для пуш-уведомлений на Android —
// если файла нет, приложение собирается без них.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const google = path.join(__dirname, 'google-services.json');
  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(google) ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
