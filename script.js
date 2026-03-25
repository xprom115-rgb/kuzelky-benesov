document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll("nav a");
    const current = window.location.pathname.split("/").pop();

    links.forEach(a=>{
        if(a.getAttribute("href")===current){
            a.style.background="#ffcc00";
            a.style.color="black";
            a.style.borderRadius="6px";
        }
    });
});

function goTo(url){ window.location.href=url; }

function scrollTopSmooth(){
    window.scrollTo({ top:0, behavior:"smooth" });
}
``