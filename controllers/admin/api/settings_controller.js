const Setting = require('../../../models/setting_model');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');
const {
  layCauHinhHeaderClient,
  capNhatCauHinhHeaderClient
} = require('../../../services/content/client-header-settings.service');
const { xoaCacheHeaderClient } = require('../../../middlewares/client-header-settings');

module.exports.getHomeSettings = async (req, res) => {
  try {
    const data = await Setting.find({ key: { $in: ['home_new_limit', 'home_best_limit', 'home_blog_limit'] } }).lean();
    return traJsonThanhCong(res, { status: 200, data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SETTINGS_HOME_GET_FAILED', message: error.message });
  }
};

module.exports.updateHomeSettings = async (req, res) => {
  try {
    const entries = [
      { key: 'home_new_limit', value: Number(req.body.home_new_limit || 8) },
      { key: 'home_best_limit', value: Number(req.body.home_best_limit || 8) },
      { key: 'home_blog_limit', value: Number(req.body.home_blog_limit || 6) }
    ];

    const bulk = entries.map((entry) => ({
      updateOne: {
        filter: { key: entry.key },
        update: { $set: { value: entry.value } },
        upsert: true
      }
    }));

    await Setting.bulkWrite(bulk);
    return traJsonThanhCong(res, { status: 200, message: 'Cập nhật cấu hình thành công' });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SETTINGS_HOME_UPDATE_FAILED', message: error.message });
  }
};

module.exports.getClientHeaderSettings = async (req, res) => {
  try {
    const data = await layCauHinhHeaderClient();
    return traJsonThanhCong(res, { status: 200, data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SETTINGS_HEADER_GET_FAILED', message: error.message });
  }
};

module.exports.updateClientHeaderSettings = async (req, res) => {
  try {
    const data = await capNhatCauHinhHeaderClient({
      name: req.body && req.body.client_header_name,
      logoFile: req.file || null
    });

    xoaCacheHeaderClient();
    return traJsonThanhCong(res, { status: 200, message: 'Cập nhật header client thành công', data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SETTINGS_HEADER_UPDATE_FAILED', message: error.message });
  }
};
