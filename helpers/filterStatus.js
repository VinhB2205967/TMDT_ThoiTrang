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
        },
        {
            name: "Sắp hết",
            status: "saphethang",
            class: ""
        }
    ];

    if (query.trangthai) {
        const index = loctrangthai.findIndex(item => item.status === query.trangthai);
        if (index >= 0) {
            loctrangthai[index].class = "active";
        }
    } else {
        const index = loctrangthai.findIndex(item => item.status === "");
        if (index >= 0) {
            loctrangthai[index].class = "active";
        }
    }

    return loctrangthai;
};
