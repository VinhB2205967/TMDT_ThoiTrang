const adminUsersService = require('../../../services/account/admin-users.service');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.anhChupOnline = async (req, res) => {
  try {
    const data = await adminUsersService.getAnhChupOnlineData(req.query || {});
    return traJsonThanhCong(res, { status: 200, data });
  } catch (error) {
    console.error('users.api.anhChupOnline error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'USERS_ONLINE_SNAPSHOT_FAILED',
      message: 'Không thể lấy dữ liệu online'
    });
  }
};
