"use client";

import styled from "styled-components";

interface MetaWhatsAppToggleProps {
  // false = Meta (left/unchecked), true = WhatsApp (right/checked)
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// User-provided slider toggle design, recolored from its original red/blue
// gradient to this app's own established convention: blue for everything
// Meta-related, green for everything WhatsApp-related (matches the button
// colors already used throughout Campaigns/Leads vs WhatsApp/Templates).
export default function MetaWhatsAppToggle({ checked, onChange }: MetaWhatsAppToggleProps) {
  return (
    <StyledWrapper>
      <div className="checkbox-wrapper-25">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={checked ? "Showing WhatsApp dashboard — switch to Meta" : "Showing Meta dashboard — switch to WhatsApp"}
        />
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .checkbox-wrapper-25 input[type="checkbox"] {
    background-image: -webkit-linear-gradient(hsla(0,0%,0%,.1), hsla(0,0%,100%,.1)),
                        -webkit-linear-gradient(left, #3b82f6 50%, #22c55e 50%);
    background-size: 100% 100%, 200% 100%;
    background-position: 0 0, 11px 0;
    border-radius: 18px;
    box-shadow: inset 0 1px 3px hsla(0,0%,0%,.5),
                  inset 0 0 7px hsla(0,0%,0%,.5),
                  0 0 0 1px hsla(0,0%,0%,.1),
                  0 -1px 1px 1px hsla(0,0%,0%,.25),
                  0 1px 2px 1px hsla(0,0%,100%,.75);
    cursor: pointer;
    height: 18px;
    padding-right: 18px;
    width: 54px;
    -webkit-appearance: none;
    appearance: none;
    -webkit-transition: .25s;
    transition: .25s;
  }

  .checkbox-wrapper-25 input[type="checkbox"]:after {
    background-color: #eee;
    background-image: -webkit-linear-gradient(hsla(0,0%,100%,.1), hsla(0,0%,0%,.1));
    border-radius: 18px;
    box-shadow: inset 0 1px 1px 1px hsla(0,0%,100%,1),
                  inset 0 -1px 1px 1px hsla(0,0%,0%,.25),
                  0 1px 2px 1px hsla(0,0%,0%,.5),
                  0 0 1px hsla(0,0%,0%,.25);
    content: '';
    display: block;
    height: 18px;
    width: 36px;
  }

  .checkbox-wrapper-25 input[type="checkbox"]:checked {
    background-position: 0 0, 25px 0;
    padding-left: 18px;
    padding-right: 0;
  }
`;
