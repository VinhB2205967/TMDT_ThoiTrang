const { getHomePageData } = require('../../services/content/home.service.js');

// Trang chủ
module.exports.trangChu = async (req, res) => {
    const pageData = await getHomePageData();

    res.render("client/pages/home/index.pug", {
        titlePage: "Fashion Store - Thời trang chất lượng",
        ...pageData
    });
}