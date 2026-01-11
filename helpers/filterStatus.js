module.exports = (query) => {
    let filterStatus = [
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
        const index = filterStatus.findIndex(item => item.status === query.trangthai);
        filterStatus[index].class = "active";
    } else {
        const index = filterStatus.findIndex(item => item.status === "");
        filterStatus[index].class = "active";
    }

    return filterStatus;
};
