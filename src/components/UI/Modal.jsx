import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export default function  Modal({children,open,className = '', onClose}) {

    const dialog = useRef();
    useEffect(() => {
        const Modal = dialog.current;
        if (open) {
            dialog.current.showModal();
        }
        return () => Modal.close();
    }, [open]);

    return createPortal(
    <dialog ref={dialog} className={`modal ${className}`} onClose={onClose}>
        {children}
        </dialog>,
     document.getElementById('modal')
    );
}