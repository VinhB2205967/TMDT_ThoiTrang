// Button Status Filter
const buttonsStatus = document.querySelectorAll("[button-status]");
if(buttonsStatus.length > 0) {
    let url = new URL(window.location.href);
    
    buttonsStatus.forEach(button => {
        button.addEventListener("click", () => {
            const status = button.getAttribute("button-status");
            
            // Reset về trang 1 khi lọc
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

