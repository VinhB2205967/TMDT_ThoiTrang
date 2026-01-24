// Button Status Filter
const nutTrangThai = document.querySelectorAll("[button-status]");
if(nutTrangThai.length > 0) {
    nutTrangThai.forEach(nut => {
        nut.addEventListener("click", () => {
            let duongDan = new URL(window.location.href);
            const trangThai = nut.getAttribute("button-status");
            
            duongDan.searchParams.delete("page");
            
            if(trangThai) {
                duongDan.searchParams.set("trangthai", trangThai);
            } else {
                duongDan.searchParams.delete("trangthai");
            }
            
            window.location.href = duongDan.href;
        });
    });
}
// End Button Status

// Form Search
const formTimKiem = document.querySelector("#form-search");
if(formTimKiem) {
    formTimKiem.addEventListener("submit", (e) => {
        e.preventDefault();
        let duongDan = new URL(window.location.href);
        const tuKhoa = e.target.elements.keyword.value.trim();

        if(tuKhoa) {
            duongDan.searchParams.set("keyword", tuKhoa);
        } else {
            duongDan.searchParams.delete("keyword");
        }
        
        // Reset về trang 1 khi tìm kiếm
        duongDan.searchParams.delete("page");

        window.location.href = duongDan.href;
    });
}
// End Form Search

