const { getHomeData } = require('../../../services/content/home.service.js');

module.exports.getHome = async (req, res) => {
  const homeData = await getHomeData();
  return res.json({
    success: true,
    data: {
      sections: homeData.sections.filter((s) => s.hienthi),
      banners: homeData.banners,
      flashSale: homeData.flashSale,
      newProducts: homeData.newProducts,
      bestSellers: homeData.bestSellers,
      lookbooks: homeData.lookbooks,
      brands: homeData.brands,
      blogs: homeData.blogs
    }
  });
};
