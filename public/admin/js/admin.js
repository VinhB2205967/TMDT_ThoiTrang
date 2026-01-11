// Button Status Filter
const buttonsStatus = document.querySelectorAll("[button-status]");
if(buttonsStatus.length > 0) {
    buttonsStatus.forEach(button => {
        button.addEventListener("click", () => {
            let url = new URL(window.location.href);
            const status = button.getAttribute("button-status");
            
            url.searchParams.delete("page");
            
            if(status) {
                url.searchParams.set("trangthai", status);
            } else {
                url.searchParams.delete("trangthai");
            }
            
            window.location.href = url.href;
        });
    });
}
// End Button Status

// Form Search
const formSearch = document.querySelector("#form-search");
if(formSearch) {
    formSearch.addEventListener("submit", (e) => {
        e.preventDefault();
        let url = new URL(window.location.href);
        const keyword = e.target.elements.keyword.value.trim();

        if(keyword) {
            url.searchParams.set("keyword", keyword);
        } else {
            url.searchParams.delete("keyword");
        }
        
        // Reset về trang 1 khi tìm kiếm
        url.searchParams.delete("page");

        window.location.href = url.href;
    });
}
// End Form Search

