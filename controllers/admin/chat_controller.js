module.exports.trangChat = async (req, res) => {
  const currentAdmin = (req.adminUser && req.adminUser._id)
    ? req.adminUser
    : ((req.user && req.user._id) ? req.user : null);

  return res.render('admin/pages/chat/index.pug', {
    titlePage: 'Chat khách hàng',
    adminUserId: currentAdmin && currentAdmin._id ? String(currentAdmin._id) : ''
  });
};
