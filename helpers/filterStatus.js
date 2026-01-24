module.exports = (query) => {
    let loctrangthai = [
        {
            name: "Tất cả",
            status: "",
            class: ""
        },
        {
            name: "Đang bán",
            status: "dangban",
            class: ""
        },
        {
            name: "Ngừng bán",
            status: "ngungban",
            class: ""
        },
        {
            name: "Đã hết",
            status: "dahet",
            class: ""
        }
    ];

    if (query.trangthai) {
        const index = loctrangthai.findIndex(item => item.status === query.trangthai);
        loctrangthai[index].class = "active";
    } else {
        const index = loctrangthai.findIndex(item => item.status === "");
        loctrangthai[index].class = "active";
    }

    return loctrangthai;
};
