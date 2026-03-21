module.exports.trangChat = async (req, res) => {
  return res.render('admin/pages/chat/index.pug', {
    titlePage: 'Chat khách hàng',
    adminUserId: req.adminUser && req.adminUser._id ? String(req.adminUser._id) : ''
  });
};
