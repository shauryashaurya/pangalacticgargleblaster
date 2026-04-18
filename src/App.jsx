import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import
{
  autoLayout,
  layoutWithAlgorithm,
  detectOverlaps as layoutDetectOverlaps,
} from "./layout.js";

const R = 32;
const ARROW_SIZE = 8;
let _id = 0;
const uid = () => `n${ ++_id }_${ Date.now().toString( 36 ) }`;

// -- Layout algorithms (embedded from layout.js) --

const BUILTIN_PRESETS = {
  trafficLight: {
    label: "Traffic Light",
    category: "Classic",
    description: "Cyclic three-state machine. No terminal state.",
    nodes: [
      { id: "tl_r", name: "Red", x: 160, y: 200 },
      { id: "tl_g", name: "Green", x: 400, y: 200 },
      { id: "tl_y", name: "Yellow", x: 280, y: 80 },
    ],
    edges: [
      { id: "tl_e1", from: "tl_r", to: "tl_g", event: "TIMER" },
      { id: "tl_e2", from: "tl_g", to: "tl_y", event: "TIMER" },
      { id: "tl_e3", from: "tl_y", to: "tl_r", event: "TIMER" },
    ],
    initialStateId: "tl_r",
    finalStateIds: [],
  },
  fetchLifecycle: {
    label: "Fetch Lifecycle",
    category: "Classic",
    description:
      "Async data fetching: idle, loading, success, error with retry.",
    nodes: [
      { id: "fl_i", name: "idle", x: 120, y: 180 },
      { id: "fl_l", name: "loading", x: 320, y: 180 },
      { id: "fl_s", name: "success", x: 500, y: 100 },
      { id: "fl_e", name: "error", x: 500, y: 260 },
    ],
    edges: [
      { id: "fl_e1", from: "fl_i", to: "fl_l", event: "FETCH" },
      { id: "fl_e2", from: "fl_l", to: "fl_s", event: "RESOLVE" },
      { id: "fl_e3", from: "fl_l", to: "fl_e", event: "REJECT" },
      { id: "fl_e4", from: "fl_e", to: "fl_l", event: "RETRY" },
    ],
    initialStateId: "fl_i",
    finalStateIds: [ "fl_s" ],
  },
  turnstile: {
    label: "Turnstile",
    category: "Classic",
    description: "Two-state machine with self-loops.",
    nodes: [
      { id: "ts_l", name: "locked", x: 180, y: 180 },
      { id: "ts_u", name: "unlocked", x: 420, y: 180 },
    ],
    edges: [
      { id: "ts_e1", from: "ts_l", to: "ts_u", event: "COIN" },
      { id: "ts_e2", from: "ts_u", to: "ts_l", event: "PUSH" },
      { id: "ts_e3", from: "ts_l", to: "ts_l", event: "PUSH" },
      { id: "ts_e4", from: "ts_u", to: "ts_u", event: "COIN" },
    ],
    initialStateId: "ts_l",
    finalStateIds: [ "ts_u" ],
  },
  regexAB: {
    label: "Regex (ends in 'ab')",
    category: "Classic",
    description: "DFA for (a|b)*ab. Regex-FSM equivalence.",
    nodes: [
      { id: "rx_q0", name: "q0", x: 140, y: 180 },
      { id: "rx_q1", name: "q1", x: 320, y: 180 },
      { id: "rx_q2", name: "q2", x: 500, y: 180 },
    ],
    edges: [
      { id: "rx_e1", from: "rx_q0", to: "rx_q0", event: "b" },
      { id: "rx_e2", from: "rx_q0", to: "rx_q1", event: "a" },
      { id: "rx_e3", from: "rx_q1", to: "rx_q1", event: "a" },
      { id: "rx_e4", from: "rx_q1", to: "rx_q2", event: "b" },
      { id: "rx_e5", from: "rx_q2", to: "rx_q1", event: "a" },
      { id: "rx_e6", from: "rx_q2", to: "rx_q0", event: "b" },
    ],
    initialStateId: "rx_q0",
    finalStateIds: [ "rx_q2" ],
  },
  vendingMachine: {
    label: "Vending Machine",
    category: "Classic",
    description: "Transactional process with branching and convergence.",
    nodes: [
      { id: "vm_i", name: "idle", x: 120, y: 200 },
      { id: "vm_s", name: "selecting", x: 320, y: 120 },
      { id: "vm_d", name: "dispensing", x: 500, y: 200 },
      { id: "vm_c", name: "cancelled", x: 320, y: 300 },
    ],
    edges: [
      { id: "vm_e1", from: "vm_i", to: "vm_s", event: "INSERT_COIN" },
      { id: "vm_e2", from: "vm_s", to: "vm_d", event: "SELECT" },
      { id: "vm_e3", from: "vm_s", to: "vm_c", event: "CANCEL" },
      { id: "vm_e4", from: "vm_d", to: "vm_i", event: "DISPENSE" },
      { id: "vm_e5", from: "vm_c", to: "vm_i", event: "REFUND" },
    ],
    initialStateId: "vm_i",
    finalStateIds: [ "vm_i" ],
  },
  tcpConnection: {
    label: "TCP Connection",
    category: "Classic",
    description: "Simplified TCP state diagram (RFC 793). 9 states.",
    nodes: [
      { id: "tcp_cl", name: "CLOSED", x: 100, y: 60 },
      { id: "tcp_li", name: "LISTEN", x: 100, y: 200 },
      { id: "tcp_ss", name: "SYN_SENT", x: 300, y: 60 },
      { id: "tcp_sr", name: "SYN_RCVD", x: 300, y: 200 },
      { id: "tcp_es", name: "ESTABLISHED", x: 500, y: 130 },
      { id: "tcp_fw", name: "FIN_WAIT", x: 500, y: 280 },
      { id: "tcp_cw", name: "CLOSE_WAIT", x: 300, y: 340 },
      { id: "tcp_la", name: "LAST_ACK", x: 100, y: 340 },
      { id: "tcp_tw", name: "TIME_WAIT", x: 500, y: 400 },
    ],
    edges: [
      { id: "tcp_e1", from: "tcp_cl", to: "tcp_li", event: "LISTEN" },
      { id: "tcp_e2", from: "tcp_cl", to: "tcp_ss", event: "SYN" },
      { id: "tcp_e3", from: "tcp_li", to: "tcp_sr", event: "SYN_RCVD" },
      { id: "tcp_e4", from: "tcp_ss", to: "tcp_es", event: "SYN_ACK" },
      { id: "tcp_e5", from: "tcp_sr", to: "tcp_es", event: "ACK" },
      { id: "tcp_e6", from: "tcp_es", to: "tcp_fw", event: "FIN" },
      { id: "tcp_e7", from: "tcp_es", to: "tcp_cw", event: "CLOSE" },
      { id: "tcp_e8", from: "tcp_fw", to: "tcp_tw", event: "ACK" },
      { id: "tcp_e9", from: "tcp_cw", to: "tcp_la", event: "FIN" },
      { id: "tcp_e10", from: "tcp_la", to: "tcp_cl", event: "ACK" },
      { id: "tcp_e11", from: "tcp_tw", to: "tcp_cl", event: "TIMEOUT" },
    ],
    initialStateId: "tcp_cl",
    finalStateIds: [ "tcp_cl" ],
  },
  ifrs17_contractLifecycle: {
    label: "IFRS 17: Contract Lifecycle",
    category: "IFRS 17",
    description:
      "Insurance contract from recognition through measurement to derecognition.",
    nodes: [
      { id: "i17cl_u", name: "UNRECOGNIZED", x: 100, y: 200 },
      { id: "i17cl_ir", name: "INITIAL_RECOG", x: 280, y: 100 },
      { id: "i17cl_sm", name: "SUBSEQ_MEASURE", x: 460, y: 200 },
      { id: "i17cl_mod", name: "MODIFIED", x: 280, y: 300 },
      { id: "i17cl_dr", name: "DERECOGNIZED", x: 560, y: 380 },
    ],
    edges: [
      {
        id: "i17cl_e1",
        from: "i17cl_u",
        to: "i17cl_ir",
        event: "COVERAGE_BEGINS",
      },
      {
        id: "i17cl_e2",
        from: "i17cl_ir",
        to: "i17cl_sm",
        event: "INITIAL_MEASURE",
      },
      { id: "i17cl_e3", from: "i17cl_sm", to: "i17cl_sm", event: "PERIOD_END" },
      { id: "i17cl_e4", from: "i17cl_sm", to: "i17cl_mod", event: "MODIFY" },
      { id: "i17cl_e5", from: "i17cl_mod", to: "i17cl_sm", event: "REMEASURE" },
      { id: "i17cl_e6", from: "i17cl_sm", to: "i17cl_dr", event: "SETTLE" },
      { id: "i17cl_e7", from: "i17cl_sm", to: "i17cl_dr", event: "EXPIRE" },
      { id: "i17cl_e8", from: "i17cl_sm", to: "i17cl_dr", event: "TRANSFER" },
    ],
    initialStateId: "i17cl_u",
    finalStateIds: [ "i17cl_dr" ],
  },
  ifrs17_classification: {
    label: "IFRS 17: Measurement Model",
    category: "IFRS 17",
    description: "Classification into GMM, VFA, or PAA.",
    nodes: [
      { id: "i17c_n", name: "UNCLASSIFIED", x: 100, y: 200 },
      { id: "i17c_ev", name: "EVALUATING", x: 280, y: 200 },
      { id: "i17c_gmm", name: "GMM", x: 480, y: 100 },
      { id: "i17c_vfa", name: "VFA", x: 480, y: 200 },
      { id: "i17c_paa", name: "PAA", x: 480, y: 300 },
    ],
    edges: [
      { id: "i17c_e1", from: "i17c_n", to: "i17c_ev", event: "BEGIN_CLASS" },
      { id: "i17c_e2", from: "i17c_ev", to: "i17c_vfa", event: "DIRECT_PART" },
      { id: "i17c_e3", from: "i17c_ev", to: "i17c_paa", event: "SHORT_COVER" },
      { id: "i17c_e4", from: "i17c_ev", to: "i17c_gmm", event: "GENERAL" },
    ],
    initialStateId: "i17c_n",
    finalStateIds: [ "i17c_gmm", "i17c_vfa", "i17c_paa" ],
  },
  ifrs17_csm: {
    label: "IFRS 17: CSM / Loss Component",
    category: "IFRS 17",
    description:
      "Profitable vs onerous tracking. CSM absorbs changes; when depleted, loss in P&L.",
    nodes: [
      { id: "csm_p", name: "PROFITABLE", x: 140, y: 160 },
      { id: "csm_o", name: "ONEROUS", x: 400, y: 160 },
      { id: "csm_l", name: "LOSS_IN_PL", x: 400, y: 320 },
      { id: "csm_r", name: "LOSS_REVERSED", x: 140, y: 320 },
    ],
    edges: [
      { id: "csm_e1", from: "csm_p", to: "csm_p", event: "UNFAV_ABSORBED" },
      { id: "csm_e2", from: "csm_p", to: "csm_o", event: "CSM_DEPLETED" },
      { id: "csm_e3", from: "csm_o", to: "csm_l", event: "RECOGNIZE_LOSS" },
      { id: "csm_e4", from: "csm_l", to: "csm_l", event: "FURTHER_LOSS" },
      { id: "csm_e5", from: "csm_l", to: "csm_r", event: "FAV_CHANGE" },
      { id: "csm_e6", from: "csm_r", to: "csm_p", event: "CSM_RESTORED" },
      { id: "csm_e7", from: "csm_o", to: "csm_p", event: "FAV_CHANGE" },
    ],
    initialStateId: "csm_p",
    finalStateIds: [ "csm_p" ],
  },
  ifrs9_eclStaging: {
    label: "IFRS 9: ECL Staging",
    category: "IFRS 9",
    description:
      "Expected Credit Loss: Stage 1 (12m), Stage 2 (lifetime), Stage 3 (impaired).",
    nodes: [
      { id: "i9s_1", name: "STAGE_1", x: 120, y: 200 },
      { id: "i9s_2", name: "STAGE_2", x: 320, y: 200 },
      { id: "i9s_3", name: "STAGE_3", x: 520, y: 200 },
      { id: "i9s_wo", name: "WRITTEN_OFF", x: 520, y: 360 },
      { id: "i9s_dr", name: "DERECOGNIZED", x: 120, y: 360 },
    ],
    edges: [
      { id: "i9s_e1", from: "i9s_1", to: "i9s_2", event: "SIGNIF_INCREASE" },
      { id: "i9s_e2", from: "i9s_2", to: "i9s_3", event: "DEFAULT" },
      { id: "i9s_e3", from: "i9s_2", to: "i9s_1", event: "CURE" },
      { id: "i9s_e4", from: "i9s_3", to: "i9s_2", event: "CURE" },
      { id: "i9s_e5", from: "i9s_3", to: "i9s_wo", event: "WRITE_OFF" },
      { id: "i9s_e6", from: "i9s_1", to: "i9s_dr", event: "MATURITY" },
      { id: "i9s_e7", from: "i9s_2", to: "i9s_dr", event: "MATURITY" },
      { id: "i9s_e8", from: "i9s_1", to: "i9s_3", event: "DEFAULT" },
    ],
    initialStateId: "i9s_1",
    finalStateIds: [ "i9s_dr" ],
  },
  ifrs9_classification: {
    label: "IFRS 9: Asset Classification",
    category: "IFRS 9",
    description:
      "SPPI test then Business Model test. Amortized cost, FVOCI, or FVTPL.",
    nodes: [
      { id: "i9a_i", name: "INITIAL", x: 80, y: 200 },
      { id: "i9a_sp", name: "SPPI_TEST", x: 230, y: 200 },
      { id: "i9a_bm", name: "BIZ_MODEL", x: 400, y: 120 },
      { id: "i9a_ac", name: "AMORT_COST", x: 560, y: 60 },
      { id: "i9a_oci", name: "FVOCI", x: 560, y: 180 },
      { id: "i9a_pl", name: "FVTPL", x: 400, y: 320 },
    ],
    edges: [
      { id: "i9a_e1", from: "i9a_i", to: "i9a_sp", event: "CLASSIFY" },
      { id: "i9a_e2", from: "i9a_sp", to: "i9a_bm", event: "SPPI_PASS" },
      { id: "i9a_e3", from: "i9a_sp", to: "i9a_pl", event: "SPPI_FAIL" },
      { id: "i9a_e4", from: "i9a_bm", to: "i9a_ac", event: "HOLD_COLLECT" },
      { id: "i9a_e5", from: "i9a_bm", to: "i9a_oci", event: "HOLD_SELL" },
      { id: "i9a_e6", from: "i9a_bm", to: "i9a_pl", event: "TRADING" },
    ],
    initialStateId: "i9a_i",
    finalStateIds: [ "i9a_ac", "i9a_oci", "i9a_pl" ],
  },
  ifrs9_hedge: {
    label: "IFRS 9: Hedge Accounting",
    category: "IFRS 9",
    description:
      "Designation, effectiveness testing, rebalancing, discontinuation.",
    nodes: [
      { id: "i9h_u", name: "UNDESIGNATED", x: 100, y: 200 },
      { id: "i9h_d", name: "DESIGNATED", x: 280, y: 120 },
      { id: "i9h_e", name: "EFFECTIVE", x: 460, y: 120 },
      { id: "i9h_i", name: "INEFFECTIVE", x: 460, y: 280 },
      { id: "i9h_x", name: "DISCONTINUED", x: 280, y: 340 },
    ],
    edges: [
      { id: "i9h_e1", from: "i9h_u", to: "i9h_d", event: "DESIGNATE" },
      { id: "i9h_e2", from: "i9h_d", to: "i9h_e", event: "PASS_EFF" },
      { id: "i9h_e3", from: "i9h_d", to: "i9h_i", event: "FAIL_EFF" },
      { id: "i9h_e4", from: "i9h_e", to: "i9h_e", event: "REBALANCE" },
      { id: "i9h_e5", from: "i9h_e", to: "i9h_i", event: "FAIL_EFF" },
      { id: "i9h_e6", from: "i9h_i", to: "i9h_x", event: "DISCONTINUE" },
      { id: "i9h_e7", from: "i9h_e", to: "i9h_x", event: "EXPIRE" },
      { id: "i9h_e8", from: "i9h_i", to: "i9h_e", event: "REBALANCE" },
    ],
    initialStateId: "i9h_u",
    finalStateIds: [ "i9h_x" ],
  },
  sc_orderFulfillment: {
    label: "Order Fulfillment",
    category: "Supply Chain",
    description: "Order to delivery lifecycle with return path.",
    nodes: [
      { id: "of_p", name: "PLACED", x: 80, y: 180 },
      { id: "of_c", name: "CONFIRMED", x: 200, y: 100 },
      { id: "of_pk", name: "PICKING", x: 320, y: 100 },
      { id: "of_pa", name: "PACKING", x: 440, y: 100 },
      { id: "of_sh", name: "SHIPPED", x: 540, y: 180 },
      { id: "of_d", name: "DELIVERED", x: 440, y: 300 },
      { id: "of_r", name: "RETURNED", x: 200, y: 300 },
    ],
    edges: [
      { id: "of_e1", from: "of_p", to: "of_c", event: "CONFIRM" },
      { id: "of_e2", from: "of_c", to: "of_pk", event: "BEGIN_PICK" },
      { id: "of_e3", from: "of_pk", to: "of_pa", event: "PICKED" },
      { id: "of_e4", from: "of_pa", to: "of_sh", event: "SHIP" },
      { id: "of_e5", from: "of_sh", to: "of_d", event: "DELIVER" },
      { id: "of_e6", from: "of_d", to: "of_r", event: "RETURN" },
      { id: "of_e7", from: "of_p", to: "of_p", event: "CANCEL" },
    ],
    initialStateId: "of_p",
    finalStateIds: [ "of_d" ],
  },
  sc_inventory: {
    label: "Inventory Management",
    category: "Supply Chain",
    description: "Reorder point logic with stockout handling.",
    nodes: [
      { id: "inv_ok", name: "IN_STOCK", x: 120, y: 120 },
      { id: "inv_lo", name: "LOW_STOCK", x: 300, y: 120 },
      { id: "inv_ro", name: "REORDER", x: 480, y: 120 },
      { id: "inv_rc", name: "RECEIVING", x: 480, y: 280 },
      { id: "inv_out", name: "STOCKOUT", x: 300, y: 280 },
    ],
    edges: [
      { id: "inv_e1", from: "inv_ok", to: "inv_lo", event: "SELL" },
      { id: "inv_e2", from: "inv_lo", to: "inv_ro", event: "REORDER" },
      { id: "inv_e3", from: "inv_ro", to: "inv_rc", event: "ARRIVE" },
      { id: "inv_e4", from: "inv_rc", to: "inv_ok", event: "RECEIVED" },
      { id: "inv_e5", from: "inv_lo", to: "inv_out", event: "DEPLETE" },
      { id: "inv_e6", from: "inv_out", to: "inv_ro", event: "EMERGENCY" },
      { id: "inv_e7", from: "inv_ok", to: "inv_ok", event: "SELL" },
    ],
    initialStateId: "inv_ok",
    finalStateIds: [ "inv_ok" ],
  },
  sc_qualityControl: {
    label: "Quality Control",
    category: "Supply Chain",
    description: "Inspection with pass/fail, rework loop, and scrap.",
    nodes: [
      { id: "qc_in", name: "INCOMING", x: 80, y: 200 },
      { id: "qc_ins", name: "INSPECTING", x: 220, y: 200 },
      { id: "qc_p", name: "PASSED", x: 400, y: 120 },
      { id: "qc_f", name: "FAILED", x: 400, y: 300 },
      { id: "qc_rw", name: "REWORK", x: 540, y: 300 },
      { id: "qc_sc", name: "SCRAPPED", x: 540, y: 400 },
      { id: "qc_rl", name: "RELEASED", x: 540, y: 120 },
    ],
    edges: [
      { id: "qc_e1", from: "qc_in", to: "qc_ins", event: "INSPECT" },
      { id: "qc_e2", from: "qc_ins", to: "qc_p", event: "PASS" },
      { id: "qc_e3", from: "qc_ins", to: "qc_f", event: "FAIL" },
      { id: "qc_e4", from: "qc_p", to: "qc_rl", event: "RELEASE" },
      { id: "qc_e5", from: "qc_f", to: "qc_rw", event: "REWORK_ORDER" },
      { id: "qc_e6", from: "qc_f", to: "qc_sc", event: "SCRAP" },
      { id: "qc_e7", from: "qc_rw", to: "qc_ins", event: "REINSPECT" },
    ],
    initialStateId: "qc_in",
    finalStateIds: [ "qc_rl" ],
  },
  sc_shipment: {
    label: "Shipment Tracking",
    category: "Supply Chain",
    description: "Parcel tracking with hub transfers and exception handling.",
    nodes: [
      { id: "st_b", name: "BOOKED", x: 80, y: 180 },
      { id: "st_p", name: "PICKED_UP", x: 200, y: 100 },
      { id: "st_t", name: "IN_TRANSIT", x: 340, y: 100 },
      { id: "st_h", name: "AT_HUB", x: 480, y: 100 },
      { id: "st_o", name: "OUT_DELIVERY", x: 480, y: 250 },
      { id: "st_d", name: "DELIVERED", x: 340, y: 330 },
      { id: "st_x", name: "EXCEPTION", x: 160, y: 300 },
    ],
    edges: [
      { id: "st_e1", from: "st_b", to: "st_p", event: "PICKUP" },
      { id: "st_e2", from: "st_p", to: "st_t", event: "DEPART" },
      { id: "st_e3", from: "st_t", to: "st_h", event: "ARRIVE_HUB" },
      { id: "st_e4", from: "st_h", to: "st_t", event: "FORWARD" },
      { id: "st_e5", from: "st_h", to: "st_o", event: "DISPATCH" },
      { id: "st_e6", from: "st_o", to: "st_d", event: "DELIVER" },
      { id: "st_e7", from: "st_t", to: "st_x", event: "EXCEPTION" },
      { id: "st_e8", from: "st_x", to: "st_t", event: "RESOLVE" },
    ],
    initialStateId: "st_b",
    finalStateIds: [ "st_d" ],
  },
  bayes_inference: {
    label: "Bayesian Inference",
    category: "Bayesian",
    description: "Prior -> data -> likelihood -> posterior update cycle.",
    nodes: [
      { id: "by_pr", name: "PRIOR", x: 100, y: 160 },
      { id: "by_da", name: "DATA", x: 250, y: 80 },
      { id: "by_lk", name: "LIKELIHOOD", x: 420, y: 80 },
      { id: "by_po", name: "POSTERIOR", x: 500, y: 220 },
      { id: "by_ck", name: "CHECKING", x: 320, y: 300 },
      { id: "by_dn", name: "COMPLETE", x: 120, y: 320 },
    ],
    edges: [
      { id: "by_e1", from: "by_pr", to: "by_da", event: "COLLECT" },
      { id: "by_e2", from: "by_da", to: "by_lk", event: "COMPUTE_LIK" },
      { id: "by_e3", from: "by_lk", to: "by_po", event: "UPDATE" },
      { id: "by_e4", from: "by_po", to: "by_ck", event: "CHECK" },
      { id: "by_e5", from: "by_ck", to: "by_dn", event: "CONVERGED" },
      { id: "by_e6", from: "by_ck", to: "by_da", event: "MORE_DATA" },
      { id: "by_e7", from: "by_po", to: "by_da", event: "SEQ_UPDATE" },
    ],
    initialStateId: "by_pr",
    finalStateIds: [ "by_dn" ],
  },
  bayes_modelSel: {
    label: "Model Selection (WAIC)",
    category: "Bayesian",
    description:
      "Fit candidates, compute info criteria, compare, validate with PPC.",
    nodes: [
      { id: "bm_c", name: "CANDIDATES", x: 100, y: 180 },
      { id: "bm_f", name: "FITTING", x: 260, y: 100 },
      { id: "bm_w", name: "COMPUTING_IC", x: 420, y: 100 },
      { id: "bm_cp", name: "COMPARING", x: 500, y: 220 },
      { id: "bm_s", name: "SELECTED", x: 360, y: 320 },
      { id: "bm_v", name: "VALIDATED", x: 160, y: 320 },
    ],
    edges: [
      { id: "bm_e1", from: "bm_c", to: "bm_f", event: "FIT" },
      { id: "bm_e2", from: "bm_f", to: "bm_w", event: "COMPUTE_WAIC" },
      { id: "bm_e3", from: "bm_w", to: "bm_cp", event: "COMPARE" },
      { id: "bm_e4", from: "bm_cp", to: "bm_s", event: "SELECT_BEST" },
      { id: "bm_e5", from: "bm_cp", to: "bm_f", event: "ADD_MODEL" },
      { id: "bm_e6", from: "bm_s", to: "bm_v", event: "PPC_PASS" },
      { id: "bm_e7", from: "bm_s", to: "bm_c", event: "PPC_FAIL" },
    ],
    initialStateId: "bm_c",
    finalStateIds: [ "bm_v" ],
  },
  bayes_ab: {
    label: "Bayesian A/B Testing",
    category: "Bayesian",
    description: "Bayesian A/B with optional early stopping.",
    nodes: [
      { id: "ba_d", name: "DESIGN", x: 100, y: 180 },
      { id: "ba_r", name: "RUNNING", x: 280, y: 100 },
      { id: "ba_a", name: "ANALYZING", x: 460, y: 100 },
      { id: "ba_i", name: "INCONCLUSIVE", x: 460, y: 260 },
      { id: "ba_w", name: "WINNER", x: 280, y: 320 },
      { id: "ba_o", name: "ROLLED_OUT", x: 100, y: 320 },
    ],
    edges: [
      { id: "ba_e1", from: "ba_d", to: "ba_r", event: "START" },
      { id: "ba_e2", from: "ba_r", to: "ba_a", event: "BATCH_DONE" },
      { id: "ba_e3", from: "ba_a", to: "ba_w", event: "THRESHOLD_MET" },
      { id: "ba_e4", from: "ba_a", to: "ba_i", event: "BELOW_THRESH" },
      { id: "ba_e5", from: "ba_i", to: "ba_r", event: "CONTINUE" },
      { id: "ba_e6", from: "ba_i", to: "ba_w", event: "MAX_SAMPLE" },
      { id: "ba_e7", from: "ba_w", to: "ba_o", event: "ROLLOUT" },
    ],
    initialStateId: "ba_d",
    finalStateIds: [ "ba_o" ],
  },
  mcmc_mh: {
    label: "Metropolis-Hastings",
    category: "MCMC",
    description:
      "Propose, evaluate acceptance ratio, accept/reject, record, repeat.",
    nodes: [
      { id: "mh_i", name: "INIT", x: 80, y: 200 },
      { id: "mh_p", name: "PROPOSE", x: 240, y: 120 },
      { id: "mh_ev", name: "EVALUATE", x: 420, y: 120 },
      { id: "mh_a", name: "ACCEPTED", x: 520, y: 240 },
      { id: "mh_r", name: "REJECTED", x: 320, y: 300 },
      { id: "mh_rc", name: "RECORDED", x: 140, y: 340 },
    ],
    edges: [
      { id: "mh_e1", from: "mh_i", to: "mh_p", event: "START" },
      { id: "mh_e2", from: "mh_p", to: "mh_ev", event: "COMPUTE_RATIO" },
      { id: "mh_e3", from: "mh_ev", to: "mh_a", event: "ACCEPT" },
      { id: "mh_e4", from: "mh_ev", to: "mh_r", event: "REJECT" },
      { id: "mh_e5", from: "mh_a", to: "mh_rc", event: "RECORD_NEW" },
      { id: "mh_e6", from: "mh_r", to: "mh_rc", event: "RECORD_CURR" },
      { id: "mh_e7", from: "mh_rc", to: "mh_p", event: "NEXT_ITER" },
    ],
    initialStateId: "mh_i",
    finalStateIds: [ "mh_rc" ],
  },
  mcmc_convergence: {
    label: "MCMC Convergence",
    category: "MCMC",
    description: "Warmup, burn-in, sampling, R-hat diagnostics.",
    nodes: [
      { id: "mc_w", name: "WARMUP", x: 100, y: 160 },
      { id: "mc_b", name: "BURN_IN", x: 260, y: 100 },
      { id: "mc_s", name: "SAMPLING", x: 420, y: 100 },
      { id: "mc_d", name: "DIAGNOSTICS", x: 500, y: 240 },
      { id: "mc_c", name: "CONVERGED", x: 340, y: 320 },
      { id: "mc_f", name: "NOT_CONV", x: 140, y: 300 },
    ],
    edges: [
      { id: "mc_e1", from: "mc_w", to: "mc_b", event: "ADAPT_DONE" },
      { id: "mc_e2", from: "mc_b", to: "mc_s", event: "DISCARD" },
      { id: "mc_e3", from: "mc_s", to: "mc_d", event: "CHECK" },
      { id: "mc_e4", from: "mc_d", to: "mc_c", event: "RHAT_OK" },
      { id: "mc_e5", from: "mc_d", to: "mc_f", event: "RHAT_BAD" },
      { id: "mc_e6", from: "mc_f", to: "mc_w", event: "RETUNE" },
      { id: "mc_e7", from: "mc_f", to: "mc_s", event: "EXTEND" },
    ],
    initialStateId: "mc_w",
    finalStateIds: [ "mc_c" ],
  },
  mcmc_gibbs: {
    label: "Gibbs Sampler",
    category: "MCMC",
    description:
      "Cycle through conditionals: theta1, theta2, theta3, record, repeat.",
    nodes: [
      { id: "gb_i", name: "INIT", x: 100, y: 200 },
      { id: "gb_1", name: "SAMPLE_T1", x: 260, y: 100 },
      { id: "gb_2", name: "SAMPLE_T2", x: 440, y: 100 },
      { id: "gb_3", name: "SAMPLE_T3", x: 500, y: 240 },
      { id: "gb_r", name: "RECORD", x: 320, y: 320 },
    ],
    edges: [
      { id: "gb_e1", from: "gb_i", to: "gb_1", event: "START" },
      { id: "gb_e2", from: "gb_1", to: "gb_2", event: "COND_2" },
      { id: "gb_e3", from: "gb_2", to: "gb_3", event: "COND_3" },
      { id: "gb_e4", from: "gb_3", to: "gb_r", event: "STORE" },
      { id: "gb_e5", from: "gb_r", to: "gb_1", event: "NEXT_SWEEP" },
    ],
    initialStateId: "gb_i",
    finalStateIds: [ "gb_r" ],
  },
  compiler_pipeline: {
    label: "Compilation Pipeline",
    category: "Compilers",
    description:
      "Lex, parse, typecheck, optimize, codegen. Each phase can fail.",
    nodes: [
      { id: "cp_s", name: "SOURCE", x: 80, y: 180 },
      { id: "cp_l", name: "LEXING", x: 200, y: 100 },
      { id: "cp_p", name: "PARSING", x: 320, y: 100 },
      { id: "cp_t", name: "TYPE_CHECK", x: 440, y: 100 },
      { id: "cp_o", name: "OPTIMIZING", x: 520, y: 220 },
      { id: "cp_g", name: "CODE_GEN", x: 400, y: 320 },
      { id: "cp_d", name: "COMPILED", x: 240, y: 320 },
      { id: "cp_e", name: "ERROR", x: 80, y: 320 },
    ],
    edges: [
      { id: "cp_e1", from: "cp_s", to: "cp_l", event: "COMPILE" },
      { id: "cp_e2", from: "cp_l", to: "cp_p", event: "TOKENS" },
      { id: "cp_e3", from: "cp_p", to: "cp_t", event: "AST" },
      { id: "cp_e4", from: "cp_t", to: "cp_o", event: "TYPES_OK" },
      { id: "cp_e5", from: "cp_o", to: "cp_g", event: "OPTIMIZED" },
      { id: "cp_e6", from: "cp_g", to: "cp_d", event: "EMIT" },
      { id: "cp_e7", from: "cp_l", to: "cp_e", event: "LEX_ERR" },
      { id: "cp_e8", from: "cp_p", to: "cp_e", event: "PARSE_ERR" },
      { id: "cp_e9", from: "cp_t", to: "cp_e", event: "TYPE_ERR" },
    ],
    initialStateId: "cp_s",
    finalStateIds: [ "cp_d" ],
  },
  compiler_lexer: {
    label: "Lexer States",
    category: "Compilers",
    description: "Tokenizer: identifier, number, string, comment modes.",
    nodes: [
      { id: "lx_s", name: "START", x: 80, y: 200 },
      { id: "lx_id", name: "IN_IDENT", x: 240, y: 100 },
      { id: "lx_nm", name: "IN_NUMBER", x: 240, y: 300 },
      { id: "lx_st", name: "IN_STRING", x: 440, y: 100 },
      { id: "lx_cm", name: "IN_COMMENT", x: 440, y: 300 },
      { id: "lx_tk", name: "TOKEN_EMIT", x: 560, y: 200 },
      { id: "lx_er", name: "LEX_ERROR", x: 80, y: 360 },
    ],
    edges: [
      { id: "lx_e1", from: "lx_s", to: "lx_id", event: "LETTER" },
      { id: "lx_e2", from: "lx_s", to: "lx_nm", event: "DIGIT" },
      { id: "lx_e3", from: "lx_s", to: "lx_st", event: "QUOTE" },
      { id: "lx_e4", from: "lx_s", to: "lx_cm", event: "DBLSLASH" },
      { id: "lx_e5", from: "lx_id", to: "lx_id", event: "LETTER" },
      { id: "lx_e6", from: "lx_id", to: "lx_id", event: "DIGIT" },
      { id: "lx_e7", from: "lx_id", to: "lx_tk", event: "DELIM" },
      { id: "lx_e8", from: "lx_nm", to: "lx_nm", event: "DIGIT" },
      { id: "lx_e9", from: "lx_nm", to: "lx_tk", event: "DELIM" },
      { id: "lx_e10", from: "lx_st", to: "lx_st", event: "CHAR" },
      { id: "lx_e11", from: "lx_st", to: "lx_tk", event: "CLOSE_Q" },
      { id: "lx_e12", from: "lx_cm", to: "lx_cm", event: "CHAR" },
      { id: "lx_e13", from: "lx_cm", to: "lx_s", event: "NEWLINE" },
      { id: "lx_e14", from: "lx_tk", to: "lx_s", event: "NEXT" },
      { id: "lx_e15", from: "lx_s", to: "lx_er", event: "INVALID" },
      { id: "lx_e16", from: "lx_s", to: "lx_tk", event: "WS" },
    ],
    initialStateId: "lx_s",
    finalStateIds: [ "lx_tk" ],
  },
  compiler_gc: {
    label: "GC (Mark-Sweep)",
    category: "Compilers",
    description: "Trigger, scan roots, mark, sweep, finalize, resume mutator.",
    nodes: [
      { id: "gc_m", name: "MUTATOR", x: 100, y: 180 },
      { id: "gc_t", name: "TRIGGERED", x: 260, y: 100 },
      { id: "gc_mk", name: "MARKING", x: 420, y: 100 },
      { id: "gc_sw", name: "SWEEPING", x: 520, y: 220 },
      { id: "gc_fn", name: "FINALIZING", x: 380, y: 320 },
      { id: "gc_r", name: "RESUMED", x: 180, y: 320 },
    ],
    edges: [
      { id: "gc_e1", from: "gc_m", to: "gc_t", event: "ALLOC_THRESH" },
      { id: "gc_e2", from: "gc_t", to: "gc_mk", event: "SCAN_ROOTS" },
      { id: "gc_e3", from: "gc_mk", to: "gc_sw", event: "MARK_DONE" },
      { id: "gc_e4", from: "gc_sw", to: "gc_fn", event: "SWEEP_DONE" },
      { id: "gc_e5", from: "gc_fn", to: "gc_r", event: "FINALIZE" },
      { id: "gc_e6", from: "gc_r", to: "gc_m", event: "RESUME" },
    ],
    initialStateId: "gc_m",
    finalStateIds: [ "gc_m" ],
  },
  compiler_sr: {
    label: "Shift-Reduce Parser",
    category: "Compilers",
    description: "Bottom-up LR: shift, reduce, goto, accept, error.",
    nodes: [
      { id: "sr_i", name: "INIT", x: 100, y: 200 },
      { id: "sr_sh", name: "SHIFT", x: 280, y: 120 },
      { id: "sr_rd", name: "REDUCE", x: 460, y: 120 },
      { id: "sr_gt", name: "GOTO", x: 460, y: 280 },
      { id: "sr_ac", name: "ACCEPT", x: 280, y: 340 },
      { id: "sr_er", name: "ERROR", x: 100, y: 340 },
    ],
    edges: [
      { id: "sr_e1", from: "sr_i", to: "sr_sh", event: "READ_TOKEN" },
      { id: "sr_e2", from: "sr_sh", to: "sr_sh", event: "SHIFT" },
      { id: "sr_e3", from: "sr_sh", to: "sr_rd", event: "REDUCE" },
      { id: "sr_e4", from: "sr_rd", to: "sr_gt", event: "APPLY_RULE" },
      { id: "sr_e5", from: "sr_gt", to: "sr_sh", event: "PUSH_STATE" },
      { id: "sr_e6", from: "sr_sh", to: "sr_ac", event: "EOF" },
      { id: "sr_e7", from: "sr_sh", to: "sr_er", event: "INVALID" },
      { id: "sr_e8", from: "sr_rd", to: "sr_ac", event: "START_RULE" },
    ],
    initialStateId: "sr_i",
    finalStateIds: [ "sr_ac" ],
  },
  cicd: {
    label: "CI/CD Pipeline",
    category: "DevOps",
    description:
      "Commit, build, test, stage, deploy with failure and rollback.",
    nodes: [
      { id: "ci_c", name: "COMMITTED", x: 80, y: 180 },
      { id: "ci_b", name: "BUILDING", x: 220, y: 100 },
      { id: "ci_t", name: "TESTING", x: 380, y: 100 },
      { id: "ci_s", name: "STAGING", x: 520, y: 180 },
      { id: "ci_p", name: "PRODUCTION", x: 400, y: 300 },
      { id: "ci_f", name: "FAILED", x: 160, y: 320 },
      { id: "ci_r", name: "ROLLED_BACK", x: 520, y: 340 },
    ],
    edges: [
      { id: "ci_e1", from: "ci_c", to: "ci_b", event: "PUSH" },
      { id: "ci_e2", from: "ci_b", to: "ci_t", event: "BUILD_OK" },
      { id: "ci_e3", from: "ci_b", to: "ci_f", event: "BUILD_FAIL" },
      { id: "ci_e4", from: "ci_t", to: "ci_s", event: "TESTS_PASS" },
      { id: "ci_e5", from: "ci_t", to: "ci_f", event: "TESTS_FAIL" },
      { id: "ci_e6", from: "ci_s", to: "ci_p", event: "APPROVE" },
      { id: "ci_e7", from: "ci_p", to: "ci_r", event: "ROLLBACK" },
      { id: "ci_e8", from: "ci_f", to: "ci_c", event: "FIX_PUSH" },
    ],
    initialStateId: "ci_c",
    finalStateIds: [ "ci_p" ],
  },
};

function validateMachine ( m, key )
{
  const d = [],
    k = key || "(current)";
  if ( !m )
  {
    d.push( { severity: "error", msg: `[${ k }] Machine is null.` } );
    return d;
  }
  if ( !Array.isArray( m.nodes ) || m.nodes.length === 0 )
  {
    d.push( { severity: "error", msg: `[${ k }] No nodes.` } );
    return d;
  }
  if ( !Array.isArray( m.edges ) )
  {
    d.push( { severity: "error", msg: `[${ k }] edges not an array.` } );
    return d;
  }
  const nids = new Set(),
    nnames = new Set();
  m.nodes.forEach( ( n, i ) =>
  {
    if ( !n.id ) d.push( { severity: "error", msg: `[${ k }] Node[${ i }] no id.` } );
    if ( !n.name )
      d.push( { severity: "warn", msg: `[${ k }] Node "${ n.id }" empty name.` } );
    if ( typeof n.x !== "number" || typeof n.y !== "number" )
      d.push( {
        severity: "warn",
        msg: `[${ k }] Node "${ n.id }" non-numeric coords.`,
      } );
    if ( nids.has( n.id ) )
      d.push( { severity: "error", msg: `[${ k }] Dup node id "${ n.id }".` } );
    nids.add( n.id );
    if ( nnames.has( n.name ) )
      d.push( { severity: "warn", msg: `[${ k }] Dup node name "${ n.name }".` } );
    nnames.add( n.name );
  } );
  const eids = new Set(),
    tm = {};
  m.edges.forEach( ( e, i ) =>
  {
    if ( !e.id ) d.push( { severity: "error", msg: `[${ k }] Edge[${ i }] no id.` } );
    if ( eids.has( e.id ) )
      d.push( { severity: "error", msg: `[${ k }] Dup edge id "${ e.id }".` } );
    eids.add( e.id );
    if ( e.from && !nids.has( e.from ) )
      d.push( {
        severity: "error",
        msg: `[${ k }] Edge "${ e.id }" unknown from "${ e.from }".`,
      } );
    if ( e.to && !nids.has( e.to ) )
      d.push( {
        severity: "error",
        msg: `[${ k }] Edge "${ e.id }" unknown to "${ e.to }".`,
      } );
    if ( !e.event )
      d.push( { severity: "warn", msg: `[${ k }] Edge "${ e.id }" empty event.` } );
    const tk = `${ e.from }::${ e.event }`;
    if ( tm[ tk ] )
      d.push( {
        severity: "warn",
        msg: `[${ k }] Nondet: (${ e.from }, ${ e.event }) multi targets.`,
      } );
    tm[ tk ] = true;
  } );
  if ( m.initialStateId && !nids.has( m.initialStateId ) )
    d.push( {
      severity: "error",
      msg: `[${ k }] initialStateId "${ m.initialStateId }" unknown.`,
    } );
  if ( !m.initialStateId )
    d.push( { severity: "warn", msg: `[${ k }] No initial state.` } );
  if ( Array.isArray( m.finalStateIds ) )
    m.finalStateIds.forEach( ( f ) =>
    {
      if ( !nids.has( f ) )
        d.push( {
          severity: "error",
          msg: `[${ k }] finalStateIds unknown "${ f }".`,
        } );
    } );
  if ( d.length === 0 )
    d.push( {
      severity: "ok",
      msg: `[${ k }] Valid. ${ m.nodes.length }S ${ m.edges.length }E.`,
    } );
  return d;
}

function validatePresetFile ( data )
{
  const d = [];
  if ( !data || typeof data !== "object" )
  {
    d.push( { severity: "error", msg: "Not a valid JSON object." } );
    return { diags: d, machines: {} };
  }
  if ( data.format && data.format !== "PanGalacticGargleBlaster-fsm" )
    d.push( {
      severity: "warn",
      msg: `Format: "${ data.format }" (expected "PanGalacticGargleBlaster-fsm").`,
    } );
  if ( data.version )
    d.push( { severity: "info", msg: `Version: ${ data.version }` } );
  const machines = data.machines || data;
  if ( typeof machines !== "object" || Array.isArray( machines ) )
  {
    d.push( { severity: "error", msg: "No 'machines' object found." } );
    return { diags: d, machines: {} };
  }
  const valid = {};
  let total = 0,
    ok = 0;
  Object.entries( machines ).forEach( ( [ key, m ] ) =>
  {
    if ( [ "version", "format", "description", "schema" ].includes( key ) ) return;
    total++;
    const md = validateMachine( m, key );
    if ( !md.some( ( x ) => x.severity === "error" ) )
    {
      valid[ key ] = m;
      ok++;
    }
    d.push( ...md );
  } );
  d.unshift( { severity: "info", msg: `Parsed ${ total } entries, ${ ok } valid.` } );
  return { diags: d, machines: valid };
}

function vecLen ( dx, dy )
{
  return Math.sqrt( dx * dx + dy * dy );
}
function edgePoints ( ax, ay, bx, by, r )
{
  const dx = bx - ax,
    dy = by - ay,
    l = vecLen( dx, dy );
  if ( l === 0 ) return { x1: ax, y1: ay, x2: bx, y2: by };
  return {
    x1: ax + ( dx / l ) * r,
    y1: ay + ( dy / l ) * r,
    x2: bx - ( dx / l ) * r,
    y2: by - ( dy / l ) * r,
  };
}
function selfLoopPath ( cx, cy, r, idx )
{
  const o = 50 + ( idx || 0 ) * 14,
    s = 22,
    t = cy - r;
  return {
    d: `M ${ cx - s } ${ t } C ${ cx - s - 10 } ${ t - o }, ${ cx + s + 10 } ${ t - o }, ${ cx + s } ${ t }`,
    labelX: cx,
    labelY: t - o + 5,
  };
}
function curvedPath ( ax, ay, bx, by, r, offset )
{
  const dx = bx - ax,
    dy = by - ay,
    l = vecLen( dx, dy );
  if ( l === 0 ) return { d: "", labelX: ax, labelY: ay };
  const ux = dx / l,
    uy = dy / l,
    px = -uy,
    py = ux,
    mx = ( ax + bx ) / 2 + px * offset,
    my = ( ay + by ) / 2 + py * offset,
    sa = Math.atan2( my - ay, mx - ax ),
    ea = Math.atan2( my - by, mx - bx ),
    x1 = ax + Math.cos( sa ) * r,
    y1 = ay + Math.sin( sa ) * r,
    x2 = bx + Math.cos( ea ) * r,
    y2 = by + Math.sin( ea ) * r;
  return {
    d: `M ${ x1 } ${ y1 } Q ${ mx } ${ my } ${ x2 } ${ y2 }`,
    labelX: ( x1 + 2 * mx + x2 ) / 4,
    labelY: ( y1 + 2 * my + y2 ) / 4,
  };
}
function getReachable ( nodes, edges, iid )
{
  if ( !iid ) return new Set();
  const a = {};
  nodes.forEach( ( n ) => ( a[ n.id ] = [] ) );
  edges.forEach( ( e ) =>
  {
    if ( a[ e.from ] ) a[ e.from ].push( e.to );
  } );
  const v = new Set( [ iid ] ),
    q = [ iid ];
  while ( q.length )
  {
    const c = q.shift();
    ( a[ c ] || [] ).forEach( ( nb ) =>
    {
      if ( !v.has( nb ) )
      {
        v.add( nb );
        q.push( nb );
      }
    } );
  }
  return v;
}
function getDeadStates ( nodes, edges, fids )
{
  if ( fids.length === 0 ) return new Set( nodes.map( ( n ) => n.id ) );
  const ra = {};
  nodes.forEach( ( n ) => ( ra[ n.id ] = [] ) );
  edges.forEach( ( e ) =>
  {
    if ( ra[ e.to ] ) ra[ e.to ].push( e.from );
  } );
  const al = new Set( fids ),
    q = [ ...fids ];
  while ( q.length )
  {
    const c = q.shift();
    ( ra[ c ] || [] ).forEach( ( nb ) =>
    {
      if ( !al.has( nb ) )
      {
        al.add( nb );
        q.push( nb );
      }
    } );
  }
  return new Set( nodes.filter( ( n ) => !al.has( n.id ) ).map( ( n ) => n.id ) );
}
function checkDeterminism ( edges )
{
  const s = {},
    d = [];
  edges.forEach( ( e ) =>
  {
    const k = `${ e.from }::${ e.event }`;
    if ( s[ k ] ) d.push( { state: e.from, event: e.event } );
    else s[ k ] = 1;
  } );
  return d;
}
function getUnhandledEvents ( nodes, edges )
{
  const ae = [ ...new Set( edges.map( ( e ) => e.event ) ) ],
    r = {};
  nodes.forEach( ( n ) =>
  {
    const h = new Set( edges.filter( ( e ) => e.from === n.id ).map( ( e ) => e.event ) );
    const u = ae.filter( ( ev ) => !h.has( ev ) );
    if ( u.length > 0 ) r[ n.name ] = u;
  } );
  return r;
}

function hopcroftMinimize ( nodes, edges, iid, fids )
{
  if ( !iid || nodes.length === 0 ) return null;
  const reach = getReachable( nodes, edges, iid ),
    rN = nodes.filter( ( n ) => reach.has( n.id ) );
  if ( rN.length === 0 ) return null;
  const ae = [ ...new Set( edges.map( ( e ) => e.event ) ) ],
    sids = rN.map( ( n ) => n.id ),
    fs = new Set( fids ),
    tm = {};
  sids.forEach( ( s ) =>
  {
    tm[ s ] = {};
    ae.forEach( ( ev ) =>
    {
      const t = edges.find( ( e ) => e.from === s && e.event === ev );
      tm[ s ][ ev ] = t ? t.to : null;
    } );
  } );
  let P = [];
  const f = sids.filter( ( s ) => fs.has( s ) ),
    nf = sids.filter( ( s ) => !fs.has( s ) );
  if ( f.length ) P.push( f );
  if ( nf.length ) P.push( nf );
  if ( !P.length ) return null;
  let chg = true,
    it = 0;
  while ( chg && it < 200 )
  {
    chg = false;
    it++;
    const nP = [];
    for ( const p of P )
    {
      if ( p.length <= 1 )
      {
        nP.push( p );
        continue;
      }
      const gpi = ( sid ) => P.findIndex( ( pp ) => pp.includes( sid ) );
      const sig = ( sid ) =>
        ae
          .map( ( ev ) =>
          {
            const t = tm[ sid ][ ev ];
            return t ? gpi( t ) : -1;
          } )
          .join( "," );
      const g = {};
      p.forEach( ( s ) =>
      {
        const k = sig( s );
        if ( !g[ k ] ) g[ k ] = [];
        g[ k ].push( s );
      } );
      const sp = Object.values( g );
      if ( sp.length > 1 ) chg = true;
      nP.push( ...sp );
    }
    P = nP;
  }
  const nm = {};
  rN.forEach( ( n ) => ( nm[ n.id ] = n ) );
  const gpfs = ( sid ) => P.findIndex( ( pp ) => pp.includes( sid ) );
  const mN = P.map( ( p, i ) => ( {
    id: `min_${ i }`,
    name: p.map( ( s ) => nm[ s ]?.name || s ).join( "/" ),
    x: 140 + ( i % 4 ) * 140,
    y: 100 + Math.floor( i / 4 ) * 120,
  } ) );
  const meS = new Set(),
    mE = [];
  P.forEach( ( p, i ) =>
  {
    const rep = p[ 0 ];
    ae.forEach( ( ev ) =>
    {
      const t = tm[ rep ][ ev ];
      if ( t )
      {
        const ti = gpfs( t );
        const k = `${ i }::${ ev }::${ ti }`;
        if ( !meS.has( k ) )
        {
          meS.add( k );
          mE.push( {
            id: `me_${ meS.size }`,
            from: `min_${ i }`,
            to: `min_${ ti }`,
            event: ev,
          } );
        }
      }
    } );
  } );
  return {
    nodes: mN,
    edges: mE,
    initialStateId: `min_${ gpfs( iid ) }`,
    finalStateIds: P.map( ( p, i ) =>
      p.some( ( s ) => fs.has( s ) ) ? `min_${ i }` : null,
    ).filter( Boolean ),
  };
}

function genStrings ( nodes, edges, iid, fids, maxL )
{
  if ( !iid || fids.length === 0 ) return { accepted: [], rejected: [] };
  const fs = new Set( fids ),
    adj = {};
  nodes.forEach( ( n ) => ( adj[ n.id ] = [] ) );
  edges.forEach( ( e ) =>
  {
    if ( adj[ e.from ] ) adj[ e.from ].push( { to: e.to, event: e.event } );
  } );
  const acc = [],
    rej = [],
    q = [ { s: iid, p: [] } ],
    v = new Set( [ `${ iid }::` ] );
  while ( q.length && ( acc.length < 5 || rej.length < 5 ) )
  {
    const { s, p } = q.shift();
    if ( p.length > 0 && p.length <= maxL )
    {
      if ( fs.has( s ) && acc.length < 5 ) acc.push( p.join( ", " ) );
      else if ( !fs.has( s ) && rej.length < 5 ) rej.push( p.join( ", " ) );
    }
    if ( p.length < maxL )
      ( adj[ s ] || [] ).forEach( ( { to, event } ) =>
      {
        const k = `${ to }::${ [ ...p, event ] }`;
        if ( !v.has( k ) )
        {
          v.add( k );
          q.push( { s: to, p: [ ...p, event ] } );
        }
      } );
  }
  return { accepted: acc, rejected: rej };
}

function generateCode ( nodes, edges, iid, fids )
{
  if ( !nodes.length ) return "// Add states and transitions to generate code.";
  const nm = {};
  nodes.forEach( ( n ) => ( nm[ n.id ] = n.name ) );
  const sn = nodes.map( ( n ) => n.name ),
    en = [ ...new Set( edges.map( ( e ) => e.event ) ) ],
    init = iid ? nm[ iid ] || "?" : "?";
  const gr = {};
  nodes.forEach( ( n ) => ( gr[ n.id ] = [] ) );
  edges.forEach( ( e ) =>
  {
    if ( gr[ e.from ] ) gr[ e.from ].push( e );
  } );
  let c = `type State = ${ sn.map( ( s ) => `"${ s }"` ).join( " | " ) || "never" };\n\ntype Event = ${ en.map( ( e ) => `"${ e }"` ).join( " | " ) || "never" };\n\nfunction transition(state: State, event: Event): State {\n  switch (state) {\n`;
  nodes.forEach( ( n ) =>
  {
    c += `    case "${ n.name }":\n      switch (event) {\n`;
    ( gr[ n.id ] || [] ).forEach( ( e ) =>
    {
      c += `        case "${ e.event }": return "${ nm[ e.to ] }";\n`;
    } );
    c += `        default: return state;\n      }\n`;
  } );
  c += `    default: return state;\n  }\n}\n\n// const [state, dispatch] = useReducer(transition, "${ init }");\n// const finalState = events.reduce(transition, "${ init }");\n\n`;
  c += `// === ADVANCED: Type-safe dispatch ===\n\ntype TransitionMap = {\n`;
  nodes.forEach( ( n ) =>
  {
    const t = gr[ n.id ] || [];
    if ( !t.length ) c += `  "${ n.name }": {};\n`;
    else
    {
      c += `  "${ n.name }": {\n`;
      t.forEach( ( e ) =>
      {
        c += `    "${ e.event }": "${ nm[ e.to ] }";\n`;
      } );
      c += `  };\n`;
    }
  } );
  c += `};\n\ntype ValidEvent<S extends State> = keyof TransitionMap[S];\ntype NextState<S extends State, E extends ValidEvent<S>> = TransitionMap[S][E];\n\nfunction typedDispatch<S extends State, E extends ValidEvent<S>>(state: S, event: E): NextState<S, E> {\n  return (TransitionMap as any)[state][event];\n}\n`;
  return c;
}

function computeEdgePaths ( nodes, edges )
{
  const nm = {};
  nodes.forEach( ( n ) => ( nm[ n.id ] = n ) );
  const pc = {},
    pi = {};
  edges.forEach( ( e ) =>
  {
    const pk =
      e.from === e.to ? `s::${ e.from }` : [ e.from, e.to ].sort().join( "::" );
    pc[ pk ] = ( pc[ pk ] || 0 ) + 1;
  } );
  return edges
    .map( ( e ) =>
    {
      const fn = nm[ e.from ],
        tn = nm[ e.to ];
      if ( !fn || !tn ) return null;
      if ( e.from === e.to )
      {
        const pk = `s::${ e.from }`,
          i = pi[ pk ] || 0;
        pi[ pk ] = i + 1;
        // return { ...e, ...selfLoopPath( fn.x, fn.y, R, i ), isSelf: true };
        const sl = selfLoopPath( fn.x, fn.y, R, i );
        sl.labelY = sl.labelY - i * 12;
        return { ...e, ...sl, isSelf: true };
      }
      const pk = [ e.from, e.to ].sort().join( "::" ),
        tot = pc[ pk ] || 1,
        i = pi[ pk ] || 0;
      pi[ pk ] = i + 1;
      if ( tot === 1 )
      {
        const p = edgePoints( fn.x, fn.y, tn.x, tn.y, R );
        return {
          ...e,
          d: `M ${ p.x1 } ${ p.y1 } L ${ p.x2 } ${ p.y2 }`,
          labelX: ( p.x1 + p.x2 ) / 2,
          // labelY: (p.y1 + p.y2) / 2 - 8,
          labelY: ( p.y1 + p.y2 ) / 2 - 10,
          isSelf: false,
        };
      }
      // return {
      //   ...e,
      //   ...curvedPath( fn.x, fn.y, tn.x, tn.y, R, ( i - ( tot - 1 ) / 2 ) * 35 ),
      //   isSelf: false,
      // };
      const off = ( i - ( tot - 1 ) / 2 ) * 35;
      const cp = curvedPath( fn.x, fn.y, tn.x, tn.y, R, off );
      cp.labelY = cp.labelY + ( off > 0 ? -10 : off < 0 ? 10 : 0 );
      return { ...e, ...cp, isSelf: false };
    } )
    .filter( Boolean );
}

function hlTS ( code )
{
  return code
    .split( "\n" )
    .map( ( l ) =>
    {
      let h = l
        .replace( /&/g, "&amp;" )
        .replace( /</g, "&lt;" )
        .replace( />/g, "&gt;" );
      if ( h.trimStart().startsWith( "//" ) )
        return `<span style="color:#6a737d">${ h }</span>`;
      h = h.replace(
        /\b(type|function|switch|case|return|default|const|extends|keyof|any|as|never)\b/g,
        '<span style="color:#ff7b72">$1</span>',
      );
      h = h.replace( /"([^"]*)"/g, '<span style="color:#a5d6ff">"$1"</span>' );
      h = h.replace(
        /\b(State|Event|TransitionMap|ValidEvent|NextState)\b/g,
        '<span style="color:#d2a8ff">$1</span>',
      );
      return h;
    } )
    .join( "\n" );
}

export default function PanGalacticGargleBlaster ()
{
  const [ presets, setPresets ] = useState( BUILTIN_PRESETS );
  const [ nodes, setNodes ] = useState( [] );
  const [ edges, setEdges ] = useState( [] );
  const [ initialStateId, setInitialStateId ] = useState( null );
  const [ finalStateIds, setFinalStateIds ] = useState( [] );
  const [ selectedId, setSelectedId ] = useState( null );
  const [ selectedType, setSelectedType ] = useState( null );
  const [ mode, setMode ] = useState( "select" );
  const [ transitionSource, setTransitionSource ] = useState( null );
  const [ activeTab, setActiveTab ] = useState( "table" );
  const [ simState, setSimState ] = useState( null );
  const [ simLog, setSimLog ] = useState( [] );
  const [ simRunning, setSimRunning ] = useState( false );
  const [ seqInput, setSeqInput ] = useState( "" );
  const [ editingName, setEditingName ] = useState( null );
  const [ editValue, setEditValue ] = useState( "" );
  const [ animEdge, setAnimEdge ] = useState( null );
  const [ dragInfo, setDragInfo ] = useState( null );
  const [ mousePos, setMousePos ] = useState( null );
  const [ presetOpen, setPresetOpen ] = useState( false );
  const [ debugLog, setDebugLog ] = useState( [] );
  const [ showDebug, setShowDebug ] = useState( false );

  const [ layoutAlgo, setLayoutAlgo ] = useState( "auto" );

  const svgRef = useRef( null );
  const nameInputRef = useRef( null );
  const fileInputRef = useRef( null );

  const nodeMap = useMemo( () =>
  {
    const m = {};
    nodes.forEach( ( n ) => ( m[ n.id ] = n ) );
    return m;
  }, [ nodes ] );
  const allEvents = useMemo(
    () => [ ...new Set( edges.map( ( e ) => e.event ) ) ],
    [ edges ],
  );
  const edgePaths = useMemo(
    () => computeEdgePaths( nodes, edges ),
    [ nodes, edges ],
  );
  const finalSet = useMemo( () => new Set( finalStateIds ), [ finalStateIds ] );
  const pushDebug = useCallback( ( entries ) =>
  {
    setDebugLog( ( p ) => [ ...entries, ...p ].slice( 0, 200 ) );
  }, [] );

  const applyLayout = useCallback(
    ( algo ) =>
    {
      if ( nodes.length === 0 ) return;
      const svgEl = svgRef.current;
      const rect = svgEl ? svgEl.getBoundingClientRect() : null;
      const opts = {
        width: rect ? rect.width : 620,
        height: rect ? rect.height : 440,
        padding: 60,
        initialStateId,
      };
      const laid = layoutWithAlgorithm( nodes, edges, algo || layoutAlgo, opts );
      setNodes( laid );
      const overlaps = layoutDetectOverlaps( laid, 32 );
      if ( overlaps > 0 )
      {
        pushDebug( [
          {
            severity: "warn",
            msg: `Layout complete. ${ overlaps } overlapping pair(s) remain (may need manual adjustment).`,
          },
        ] );
      } else
      {
        pushDebug( [
          {
            severity: "ok",
            msg: `Layout applied (${ algo || layoutAlgo }). No overlaps.`,
          },
        ] );
      }
    },
    [ nodes, edges, initialStateId, layoutAlgo, pushDebug ],
  );

  // const loadMachine = useCallback((m, label) => {
  //   const diags = validateMachine(m, label); const hasErr = diags.some((d) => d.severity === "error"); pushDebug(diags);
  //   if (hasErr) { setShowDebug(true); return; }
  //   setNodes(m.nodes.map((n) => ({ ...n }))); setEdges(m.edges.map((e) => ({ ...e })));
  //   setInitialStateId(m.initialStateId || null); setFinalStateIds(m.finalStateIds ? [...m.finalStateIds] : []);
  //   setSelectedId(null); setSelectedType(null); setSimState(null); setSimLog([]); setSimRunning(false); setTransitionSource(null); setMode("select"); setPresetOpen(false); _id = 200;
  // }, [pushDebug]);

  const loadMachine = useCallback(
    ( m, label ) =>
    {
      const diags = validateMachine( m, label );
      const hasErr = diags.some( ( d ) => d.severity === "error" );
      pushDebug( diags );
      if ( hasErr )
      {
        setShowDebug( true );
        return;
      }
      let loadedNodes = m.nodes.map( ( n ) => ( { ...n } ) );
      const loadedEdges = m.edges.map( ( e ) => ( { ...e } ) );
      // detect overlaps and auto-layout if needed
      const overlaps = layoutDetectOverlaps( loadedNodes, 32 );
      if ( overlaps > 0 )
      {
        const svgEl = svgRef.current;
        const rect = svgEl ? svgEl.getBoundingClientRect() : null;
        const opts = {
          width: rect ? rect.width : 620,
          height: rect ? rect.height : 440,
          padding: 60,
          initialStateId: m.initialStateId,
        };
        loadedNodes = autoLayout( loadedNodes, loadedEdges, opts );
        pushDebug( [
          {
            severity: "info",
            msg: `Auto-layout applied: ${ overlaps } overlap(s) detected in "${ label }".`,
          },
        ] );
      }
      setNodes( loadedNodes );
      setEdges( loadedEdges );
      setInitialStateId( m.initialStateId || null );
      setFinalStateIds( m.finalStateIds ? [ ...m.finalStateIds ] : [] );
      setSelectedId( null );
      setSelectedType( null );
      setSimState( null );
      setSimLog( [] );
      setSimRunning( false );
      setTransitionSource( null );
      setMode( "select" );
      setPresetOpen( false );
      _id = 200;
    },
    [ pushDebug ],
  );

  const exportCurrent = useCallback( () =>
  {
    const w = {
      version: "1.0.0",
      format: "PanGalacticGargleBlaster-fsm",
      machines: {
        exported: {
          label: "Exported",
          category: "Custom",
          description: "",
          nodes,
          edges,
          initialStateId,
          finalStateIds,
        },
      },
    };
    const b = new Blob( [ JSON.stringify( w, null, 2 ) ], {
      type: "application/json",
    } );
    const u = URL.createObjectURL( b );
    const a = document.createElement( "a" );
    a.href = u;
    a.download = "PanGalacticGargleBlaster-machine.json";
    a.click();
    URL.revokeObjectURL( u );
    pushDebug( [ { severity: "info", msg: "Exported current machine." } ] );
  }, [ nodes, edges, initialStateId, finalStateIds, pushDebug ] );

  const exportAll = useCallback( () =>
  {
    const w = {
      version: "1.0.0",
      format: "PanGalacticGargleBlaster-fsm",
      description: "PanGalacticGargleBlaster FSM preset collection.",
      machines: presets,
    };
    const b = new Blob( [ JSON.stringify( w, null, 2 ) ], {
      type: "application/json",
    } );
    const u = URL.createObjectURL( b );
    const a = document.createElement( "a" );
    a.href = u;
    a.download = "PanGalacticGargleBlaster-presets.json";
    a.click();
    URL.revokeObjectURL( u );
    pushDebug( [
      {
        severity: "info",
        msg: `Exported ${ Object.keys( presets ).length } presets.`,
      },
    ] );
  }, [ presets, pushDebug ] );

  const exportSVG = useCallback( () =>
  {
    const svg = svgRef.current;
    if ( !svg ) return;
    const clone = svg.cloneNode( true );
    const rect = svg.getBoundingClientRect();
    clone.setAttribute( "width", rect.width );
    clone.setAttribute( "height", rect.height );
    clone.setAttribute( "xmlns", "http://www.w3.org/2000/svg" );
    // inline CSS variables so the SVG is self-contained
    const styles = document.createElement( "style" );
    styles.textContent = `
    :root{--bg:#0d1117;--sf:#161b22;--s2:#1c2333;--bd:#30363d;--fg:#c9d1d9;--fd:#8b949e;--ac:#58a6ff;--a2:#3fb950;--a3:#d2a8ff;--wr:#d29922;--er:#f85149;--gd:rgba(48,54,61,0.4)}
    text{font-family:monospace}
  `;
    clone.insertBefore( styles, clone.firstChild );
    const blob = new Blob( [ new XMLSerializer().serializeToString( clone ) ], {
      type: "image/svg+xml",
    } );
    const url = URL.createObjectURL( blob );
    const a = document.createElement( "a" );
    a.href = url;
    a.download = "PanGalacticGargleBlaster.svg";
    a.click();
    URL.revokeObjectURL( url );
  }, [] );

  const exportPNG = useCallback( () =>
  {
    const svg = svgRef.current;
    if ( !svg ) return;
    const rect = svg.getBoundingClientRect();
    const scale = 2;
    const clone = svg.cloneNode( true );
    clone.setAttribute( "width", rect.width );
    clone.setAttribute( "height", rect.height );
    clone.setAttribute( "xmlns", "http://www.w3.org/2000/svg" );
    const styles = document.createElement( "style" );
    styles.textContent = `
    :root{--bg:#0d1117;--sf:#161b22;--s2:#1c2333;--bd:#30363d;--fg:#c9d1d9;--fd:#8b949e;--ac:#58a6ff;--a2:#3fb950;--a3:#d2a8ff;--wr:#d29922;--er:#f85149;--gd:rgba(48,54,61,0.4)}
    text{font-family:monospace}
  `;
    clone.insertBefore( styles, clone.firstChild );
    const data = new XMLSerializer().serializeToString( clone );
    const img = new Image();
    img.onload = () =>
    {
      const canvas = document.createElement( "canvas" );
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext( "2d" );
      ctx.scale( scale, scale );
      ctx.fillStyle = "#0d1117";
      ctx.fillRect( 0, 0, rect.width, rect.height );
      ctx.drawImage( img, 0, 0, rect.width, rect.height );
      canvas.toBlob( ( blob ) =>
      {
        const url = URL.createObjectURL( blob );
        const a = document.createElement( "a" );
        a.href = url;
        a.download = "PanGalacticGargleBlaster.png";
        a.click();
        URL.revokeObjectURL( url );
      }, "image/png" );
    };
    img.src =
      "data:image/svg+xml;base64," + btoa( unescape( encodeURIComponent( data ) ) );
  }, [] );

  const handleImport = useCallback(
    ( e ) =>
    {
      const file = e.target.files?.[ 0 ];
      if ( !file ) return;
      const reader = new FileReader();
      reader.onload = ( ev ) =>
      {
        let data;
        try
        {
          data = JSON.parse( ev.target.result );
        } catch ( err )
        {
          pushDebug( [ { severity: "error", msg: `JSON parse: ${ err.message }` } ] );
          setShowDebug( true );
          return;
        }
        const { diags, machines } = validatePresetFile( data );
        pushDebug( diags );
        const cnt = Object.keys( machines ).length;
        if ( cnt === 0 )
        {
          pushDebug( [ { severity: "error", msg: "No valid machines in file." } ] );
          setShowDebug( true );
          return;
        }
        setPresets( ( p ) => ( { ...p, ...machines } ) );
        pushDebug( [
          {
            severity: "ok",
            msg: `Imported ${ cnt } machine(s) from "${ file.name }".`,
          },
        ] );
        if ( cnt === 1 )
        {
          const k = Object.keys( machines )[ 0 ];
          loadMachine( machines[ k ], machines[ k ].label || k );
        }
        setShowDebug( true );
      };
      reader.onerror = () =>
      {
        pushDebug( [ { severity: "error", msg: "File read failed." } ] );
        setShowDebug( true );
      };
      reader.readAsText( file );
      e.target.value = "";
    },
    [ pushDebug, loadMachine ],
  );

  const currentDiags = useMemo(
    () =>
      nodes.length === 0
        ? []
        : validateMachine(
          { nodes, edges, initialStateId, finalStateIds },
          "editor",
        ),
    [ nodes, edges, initialStateId, finalStateIds ],
  );

  const handleSvgClick = useCallback(
    ( e ) =>
    {
      if ( e.target !== svgRef.current && e.target.tagName !== "rect" ) return;
      const r = svgRef.current.getBoundingClientRect();
      const x = e.clientX - r.left,
        y = e.clientY - r.top;
      if ( mode === "addState" )
      {
        const id = uid();
        setNodes( ( p ) => [ ...p, { id, name: `s${ nodes.length }`, x, y } ] );
        if ( nodes.length === 0 ) setInitialStateId( id );
        setSelectedId( id );
        setSelectedType( "node" );
        return;
      }
      if ( mode === "select" )
      {
        setSelectedId( null );
        setSelectedType( null );
      }
    },
    [ mode, nodes.length ],
  );
  const handleNodeClick = useCallback(
    ( e, nid ) =>
    {
      e.stopPropagation();
      if ( mode === "addTransition" )
      {
        if ( !transitionSource ) setTransitionSource( nid );
        else
        {
          const id = uid();
          setEdges( ( p ) => [
            ...p,
            { id, from: transitionSource, to: nid, event: `E${ edges.length }` },
          ] );
          setTransitionSource( null );
          setSelectedId( id );
          setSelectedType( "edge" );
        }
        return;
      }
      setSelectedId( nid );
      setSelectedType( "node" );
    },
    [ mode, transitionSource, edges.length ],
  );
  const handleEdgeClick = useCallback(
    ( e, eid ) =>
    {
      e.stopPropagation();
      if ( mode === "select" )
      {
        setSelectedId( eid );
        setSelectedType( "edge" );
      }
    },
    [ mode ],
  );
  const handleMouseDown = useCallback(
    ( e, nid ) =>
    {
      if ( mode !== "select" ) return;
      e.stopPropagation();
      e.preventDefault();
      const r = svgRef.current.getBoundingClientRect();
      setDragInfo( {
        nid,
        sx: e.clientX - r.left,
        sy: e.clientY - r.top,
        ox: nodeMap[ nid ]?.x || 0,
        oy: nodeMap[ nid ]?.y || 0,
      } );
    },
    [ mode, nodeMap ],
  );

  useEffect( () =>
  {
    if ( !dragInfo ) return;
    const hm = ( e ) =>
    {
      const r = svgRef.current.getBoundingClientRect();
      setNodes( ( p ) =>
        p.map( ( n ) =>
          n.id === dragInfo.nid
            ? {
              ...n,
              x: dragInfo.ox + e.clientX - r.left - dragInfo.sx,
              y: dragInfo.oy + e.clientY - r.top - dragInfo.sy,
            }
            : n,
        ),
      );
    };
    const hu = () => setDragInfo( null );
    window.addEventListener( "mousemove", hm );
    window.addEventListener( "mouseup", hu );
    return () =>
    {
      window.removeEventListener( "mousemove", hm );
      window.removeEventListener( "mouseup", hu );
    };
  }, [ dragInfo ] );
  useEffect( () =>
  {
    if ( mode !== "addTransition" || !transitionSource ) return;
    const hm = ( e ) =>
    {
      const r = svgRef.current?.getBoundingClientRect();
      if ( r ) setMousePos( { x: e.clientX - r.left, y: e.clientY - r.top } );
    };
    window.addEventListener( "mousemove", hm );
    return () => window.removeEventListener( "mousemove", hm );
  }, [ mode, transitionSource ] );

  const deleteNode = useCallback(
    ( id ) =>
    {
      setNodes( ( p ) => p.filter( ( n ) => n.id !== id ) );
      setEdges( ( p ) => p.filter( ( e ) => e.from !== id && e.to !== id ) );
      if ( initialStateId === id ) setInitialStateId( null );
      setFinalStateIds( ( p ) => p.filter( ( f ) => f !== id ) );
      setSelectedId( null );
      setSelectedType( null );
    },
    [ initialStateId ],
  );
  const deleteEdge = useCallback( ( id ) =>
  {
    setEdges( ( p ) => p.filter( ( e ) => e.id !== id ) );
    setSelectedId( null );
    setSelectedType( null );
  }, [] );
  const renameNode = useCallback( ( id, name ) =>
  {
    setNodes( ( p ) => p.map( ( n ) => ( n.id === id ? { ...n, name } : n ) ) );
  }, [] );
  const renameEdge = useCallback( ( id, event ) =>
  {
    setEdges( ( p ) => p.map( ( e ) => ( e.id === id ? { ...e, event } : e ) ) );
  }, [] );
  const toggleFinal = useCallback( ( id ) =>
  {
    setFinalStateIds( ( p ) =>
      p.includes( id ) ? p.filter( ( f ) => f !== id ) : [ ...p, id ],
    );
  }, [] );
  const startEditing = useCallback( () =>
  {
    if ( selectedType === "node" )
    {
      const n = nodeMap[ selectedId ];
      if ( n )
      {
        setEditingName( { t: "node", id: selectedId } );
        setEditValue( n.name );
      }
    } else if ( selectedType === "edge" )
    {
      const e = edges.find( ( e ) => e.id === selectedId );
      if ( e )
      {
        setEditingName( { t: "edge", id: selectedId } );
        setEditValue( e.event );
      }
    }
  }, [ selectedType, selectedId, nodeMap, edges ] );
  const commitEdit = useCallback( () =>
  {
    if ( !editingName || !editValue.trim() )
    {
      setEditingName( null );
      return;
    }
    if ( editingName.t === "node" ) renameNode( editingName.id, editValue.trim() );
    else renameEdge( editingName.id, editValue.trim() );
    setEditingName( null );
  }, [ editingName, editValue, renameNode, renameEdge ] );
  useEffect( () =>
  {
    if ( editingName && nameInputRef.current ) nameInputRef.current.focus();
  }, [ editingName ] );

  const simStep = useCallback(
    ( ev ) =>
    {
      if ( !simState ) return;
      const edge = edges.find( ( e ) => e.from === simState && e.event === ev );
      if ( !edge ) return;
      setAnimEdge( edge.id );
      setTimeout( () =>
      {
        setSimState( edge.to );
        setSimLog( ( p ) => [
          ...p,
          {
            event: ev,
            from: nodeMap[ edge.from ]?.name || edge.from,
            to: nodeMap[ edge.to ]?.name || edge.to,
          },
        ] );
        setAnimEdge( null );
      }, 350 );
    },
    [ simState, edges, nodeMap ],
  );
  const simReset = useCallback( () =>
  {
    setSimState( initialStateId );
    setSimLog( [] );
    setAnimEdge( null );
  }, [ initialStateId ] );
  const startSim = useCallback( () =>
  {
    setSimRunning( true );
    setSimState( initialStateId );
    setSimLog( [] );
    setActiveTab( "simulate" );
  }, [ initialStateId ] );
  const stopSim = useCallback( () =>
  {
    setSimRunning( false );
    setSimState( null );
    setSimLog( [] );
    setAnimEdge( null );
  }, [] );
  const runSequence = useCallback( () =>
  {
    if ( !simState ) return;
    const evs = seqInput
      .split( "," )
      .map( ( s ) => s.trim() )
      .filter( Boolean );
    let cur = simState;
    const log = [];
    for ( const ev of evs )
    {
      const edge = edges.find( ( e ) => e.from === cur && e.event === ev );
      if ( !edge )
      {
        log.push( { event: ev, from: nodeMap[ cur ]?.name || cur, to: "[UNDEF]" } );
        break;
      }
      log.push( {
        event: ev,
        from: nodeMap[ edge.from ]?.name || edge.from,
        to: nodeMap[ edge.to ]?.name || edge.to,
      } );
      cur = edge.to;
    }
    setSimState( cur );
    setSimLog( ( p ) => [ ...p, ...log ] );
  }, [ simState, seqInput, edges, nodeMap ] );
  const addTransFromTable = useCallback(
    ( fid, ev, tid ) =>
    {
      const ex = edges.find( ( e ) => e.from === fid && e.event === ev );
      if ( ex )
        setEdges( ( p ) => p.map( ( e ) => ( e.id === ex.id ? { ...e, to: tid } : e ) ) );
      else
        setEdges( ( p ) => [ ...p, { id: uid(), from: fid, to: tid, event: ev } ] );
    },
    [ edges ],
  );

  const analysis = useMemo(
    () => ( {
      reachable: getReachable( nodes, edges, initialStateId ),
      dead: getDeadStates( nodes, edges, finalStateIds ),
      nondet: checkDeterminism( edges ),
      unhandled: getUnhandledEvents( nodes, edges ),
      minimized: hopcroftMinimize( nodes, edges, initialStateId, finalStateIds ),
      strings: genStrings( nodes, edges, initialStateId, finalStateIds, 6 ),
    } ),
    [ nodes, edges, initialStateId, finalStateIds ],
  );
  const generatedCode = useMemo(
    () => generateCode( nodes, edges, initialStateId, finalStateIds ),
    [ nodes, edges, initialStateId, finalStateIds ],
  );
  const selectedNode = selectedType === "node" ? nodeMap[ selectedId ] : null;
  const selectedEdge =
    selectedType === "edge" ? edges.find( ( e ) => e.id === selectedId ) : null;
  const availableEvents = useMemo(
    () =>
      simState
        ? [
          ...new Set(
            edges.filter( ( e ) => e.from === simState ).map( ( e ) => e.event ),
          ),
        ]
        : [],
    [ simState, edges ],
  );
  const presetsByCat = useMemo( () =>
  {
    const c = {};
    Object.entries( presets ).forEach( ( [ k, p ] ) =>
    {
      const cat = p.category || "Other";
      if ( !c[ cat ] ) c[ cat ] = [];
      c[ cat ].push( { key: k, ...p } );
    } );
    return c;
  }, [ presets ] );

  const tb = ( t ) => ( {
    padding: "7px 12px",
    background: activeTab === t ? "var(--sf)" : "transparent",
    color: activeTab === t ? "var(--fg)" : "var(--fd)",
    border: "none",
    borderBottom:
      activeTab === t ? "2px solid var(--ac)" : "2px solid transparent",
    cursor: "pointer",
    fontFamily: "'Barlow',sans-serif",
    fontSize: "12px",
    fontWeight: activeTab === t ? 600 : 400,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  } );
  const bt = ( a ) => ( {
    padding: "5px 12px",
    background: a ? "var(--ac)" : "var(--sf)",
    color: a ? "#0d1117" : "var(--fd)",
    border: "1px solid " + ( a ? "var(--ac)" : "var(--bd)" ),
    cursor: "pointer",
    fontFamily: "'Barlow',sans-serif",
    fontSize: "12px",
    fontWeight: 500,
  } );
  const sb = {
    padding: "3px 10px",
    background: "var(--sf)",
    color: "var(--fd)",
    border: "1px solid var(--bd)",
    cursor: "pointer",
    fontFamily: "'Barlow',sans-serif",
    fontSize: "11px",
  };
  const db = { ...sb, color: "#f85149", borderColor: "#f85149" };
  const sc = {
    error: "#f85149",
    warn: "#d29922",
    info: "#8b949e",
    ok: "#3fb950",
  };

  return (
    <div
      style={ {
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Barlow',sans-serif",
        background: "var(--bg)",
        color: "var(--fg)",
        overflow: "hidden",
      } }
    >
      <style>{ `
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap');
        :root{--bg:#0d1117;--sf:#161b22;--s2:#1c2333;--bd:#30363d;--fg:#c9d1d9;--fd:#8b949e;--ac:#58a6ff;--a2:#3fb950;--a3:#d2a8ff;--wr:#d29922;--er:#f85149;--gd:rgba(48,54,61,0.4)}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:var(--sf)}::-webkit-scrollbar-thumb{background:var(--bd)}
        @keyframes pN{0%,100%{stroke-width:2.5}50%{stroke-width:4}}
        select{background:var(--s2);color:var(--fg);border:1px solid var(--bd);padding:2px 4px;font-family:'Source Code Pro',monospace;font-size:11px}
        input{background:var(--s2);color:var(--fg);border:1px solid var(--bd);padding:4px 8px;font-family:'Source Code Pro',monospace;font-size:12px;outline:none}input:focus{border-color:var(--ac)}
      `}</style>
      <div
        style={ {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          borderBottom: "1px solid var(--bd)",
          background: "var(--sf)",
          flexShrink: 0,
          flexWrap: "wrap",
        } }
      >
        <span
          style={ {
            fontFamily: "'Source Code Pro',monospace",
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--ac)",
            letterSpacing: "0.05em",
          } }
        >
          Pan Galactic Gargle Blaster
        </span>
        <span style={ { fontSize: "10px", color: "var(--fd)" } }>FSM</span>
        <div style={ { display: "flex", gap: "3px", marginLeft: "6px" } }>
          <button
            style={ bt( mode === "select" ) }
            onClick={ () =>
            {
              setMode( "select" );
              setTransitionSource( null );
            } }
          >
            Select
          </button>
          <button
            style={ bt( mode === "addState" ) }
            onClick={ () =>
            {
              setMode( "addState" );
              setTransitionSource( null );
            } }
          >
            + State
          </button>
          <button
            style={ bt( mode === "addTransition" ) }
            onClick={ () =>
            {
              setMode( "addTransition" );
              setTransitionSource( null );
            } }
          >
            + Edge
          </button>
        </div>
        { mode === "addTransition" && transitionSource && (
          <span style={ { fontSize: "11px", color: "var(--ac)" } }>
            From: { nodeMap[ transitionSource ]?.name }
          </span>
        ) }
        <div
          style={ {
            marginLeft: "auto",
            display: "flex",
            gap: "3px",
            alignItems: "center",
            flexWrap: "wrap",
          } }
        >
          <div style={ { position: "relative" } }>
            <button
              style={ bt( false ) }
              onClick={ () => setPresetOpen( !presetOpen ) }
            >
              Presets ({ Object.keys( presets ).length })
            </button>
            { presetOpen && (
              <div
                style={ {
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "4px",
                  background: "var(--s2)",
                  border: "1px solid var(--bd)",
                  zIndex: 100,
                  minWidth: "220px",
                  maxHeight: "420px",
                  overflow: "auto",
                } }
              >
                { Object.entries( presetsByCat ).map( ( [ cat, items ] ) => (
                  <div key={ cat }>
                    <div
                      style={ {
                        padding: "5px 12px",
                        fontSize: "10px",
                        color: "var(--a3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--bd)",
                        background: "var(--sf)",
                      } }
                    >
                      { cat } ({ items.length })
                    </div>
                    { items.map( ( p ) => (
                      <div
                        key={ p.key }
                        style={ {
                          padding: "5px 12px",
                          cursor: "pointer",
                          fontSize: "12px",
                          borderBottom: "1px solid var(--bd)",
                        } }
                        onMouseEnter={ ( e ) =>
                          ( e.currentTarget.style.background = "var(--sf)" )
                        }
                        onMouseLeave={ ( e ) =>
                          ( e.currentTarget.style.background = "transparent" )
                        }
                        onClick={ () => loadMachine( p, p.label ) }
                      >
                        <div>{ p.label }</div>
                        { p.description && (
                          <div
                            style={ {
                              fontSize: "10px",
                              color: "var(--fd)",
                              marginTop: "1px",
                            } }
                          >
                            { p.description.slice( 0, 72 ) }
                            { p.description.length > 72 ? "..." : "" }
                          </div>
                        ) }
                      </div>
                    ) ) }
                  </div>
                ) ) }
              </div>
            ) }
          </div>
          <input
            ref={ fileInputRef }
            type="file"
            accept=".json"
            onChange={ handleImport }
            style={ { display: "none" } }
          />
          <button
            style={ bt( false ) }
            onClick={ () => fileInputRef.current?.click() }
          >
            Import
          </button>
          <button
            style={ bt( false ) }
            onClick={ exportCurrent }
          >
            Export
          </button>
          <button
            style={ bt( false ) }
            onClick={ exportAll }
          >
            Export All
          </button>
          <button
            style={ bt( false ) }
            onClick={ exportSVG }
            disabled={ nodes.length === 0 }
          >
            SVG
          </button>
          <button
            style={ bt( false ) }
            onClick={ exportPNG }
            disabled={ nodes.length === 0 }
          >
            PNG
          </button>
          {/* Layout controls */ }
          <select
            value={ layoutAlgo }
            onChange={ ( e ) => setLayoutAlgo( e.target.value ) }
            style={ {
              background: "var(--s2)",
              color: "var(--fg)",
              border: "1px solid var(--bd)",
              padding: "4px 6px",
              fontFamily: "'Barlow',sans-serif",
              fontSize: "11px",
            } }
          >
            <option value="auto">Auto</option>
            <option value="hierarchical">Hierarchical</option>
            <option value="force">Force-Directed</option>
            <option value="circular">Circular</option>
          </select>
          <button
            style={ bt( false ) }
            onClick={ () => applyLayout( layoutAlgo ) }
            disabled={ nodes.length === 0 }
          >
            Layout
          </button>
          <button
            style={ {
              ...bt( showDebug ),
              fontSize: "11px",
              padding: "5px 8px",
              color: currentDiags.some( ( d ) => d.severity === "error" )
                ? "var(--er)"
                : currentDiags.some( ( d ) => d.severity === "warn" )
                  ? "var(--wr)"
                  : "var(--fd)",
            } }
            onClick={ () => setShowDebug( !showDebug ) }
          >
            Debug
            { currentDiags.filter( ( d ) => d.severity === "error" ).length > 0
              ? ` (${ currentDiags.filter( ( d ) => d.severity === "error" ).length })`
              : "" }
          </button>
          { simRunning ? (
            <button
              style={ {
                ...bt( false ),
                borderColor: "var(--er)",
                color: "var(--er)",
              } }
              onClick={ stopSim }
            >
              Stop
            </button>
          ) : (
            <button
              style={ {
                ...bt( false ),
                borderColor: "var(--a2)",
                color: "var(--a2)",
              } }
              onClick={ startSim }
              disabled={ !initialStateId }
            >
              Sim
            </button>
          ) }
        </div>
      </div>
      { showDebug && (
        <div
          style={ {
            background: "var(--s2)",
            borderBottom: "1px solid var(--bd)",
            padding: "8px 12px",
            maxHeight: "160px",
            overflow: "auto",
            flexShrink: 0,
          } }
        >
          <div
            style={ {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "4px",
            } }
          >
            <span
              style={ {
                fontSize: "10px",
                color: "var(--fd)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              } }
            >
              Diagnostics
            </span>
            <button
              style={ { ...sb, fontSize: "10px" } }
              onClick={ () => setDebugLog( [] ) }
            >
              Clear
            </button>
          </div>
          { currentDiags.length > 0 && (
            <div style={ { marginBottom: "4px" } }>
              { currentDiags.map( ( d, i ) => (
                <div
                  key={ `c${ i }` }
                  style={ {
                    fontFamily: "'Source Code Pro',monospace",
                    fontSize: "11px",
                    color: sc[ d.severity ] || "var(--fd)",
                    lineHeight: 1.5,
                  } }
                >
                  [{ d.severity.toUpperCase() }] { d.msg }
                </div>
              ) ) }
            </div>
          ) }
          { debugLog.length > 0 && (
            <div>
              { debugLog.slice( 0, 40 ).map( ( d, i ) => (
                <div
                  key={ `d${ i }` }
                  style={ {
                    fontFamily: "'Source Code Pro',monospace",
                    fontSize: "11px",
                    color: sc[ d.severity ] || "var(--fd)",
                    lineHeight: 1.5,
                  } }
                >
                  [{ d.severity.toUpperCase() }] { d.msg }
                </div>
              ) ) }
            </div>
          ) }
        </div>
      ) }
      <div style={ { display: "flex", flex: 1, overflow: "hidden" } }>
        <div
          style={ {
            flex: "1 1 60%",
            position: "relative",
            borderRight: "1px solid var(--bd)",
            minWidth: 0,
          } }
        >
          <svg
            ref={ svgRef }
            width="100%"
            height="100%"
            style={ {
              background: "var(--bg)",
              cursor:
                mode === "addState"
                  ? "crosshair"
                  : mode === "addTransition"
                    ? "pointer"
                    : "default",
            } }
            onClick={ handleSvgClick }
          >
            <defs>
              <marker
                id="ah"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth={ ARROW_SIZE }
                markerHeight={ ARROW_SIZE }
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 10 5 L 0 9 z"
                  fill="var(--fd)"
                />
              </marker>
              <marker
                id="ahs"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth={ ARROW_SIZE }
                markerHeight={ ARROW_SIZE }
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 10 5 L 0 9 z"
                  fill="var(--ac)"
                />
              </marker>
              <marker
                id="ahg"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth={ ARROW_SIZE }
                markerHeight={ ARROW_SIZE }
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 10 5 L 0 9 z"
                  fill="var(--a2)"
                />
              </marker>
              <pattern
                id="grid"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="var(--gd)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="url(#grid)"
            />
            { mode === "addTransition" &&
              transitionSource &&
              mousePos &&
              nodeMap[ transitionSource ] && (
                <line
                  x1={ nodeMap[ transitionSource ].x }
                  y1={ nodeMap[ transitionSource ].y }
                  x2={ mousePos.x }
                  y2={ mousePos.y }
                  stroke="var(--ac)"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.6"
                />
              ) }
            { edgePaths.map( ( ep ) =>
            {
              const iS = selectedId === ep.id,
                iA = animEdge === ep.id;
              return (
                <g key={ ep.id }>
                  <path
                    d={ ep.d }
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    style={ { cursor: "pointer" } }
                    onClick={ ( e ) => handleEdgeClick( e, ep.id ) }
                  />
                  <path
                    d={ ep.d }
                    fill="none"
                    stroke={ iA ? "var(--a2)" : iS ? "var(--ac)" : "var(--fd)" }
                    strokeWidth={ iS || iA ? 2.5 : 1.5 }
                    markerEnd={ iA ? "url(#ahg)" : iS ? "url(#ahs)" : "url(#ah)" }
                    style={ { pointerEvents: "none" } }
                  />
                  <text
                    x={ ep.labelX }
                    y={ ep.labelY }
                    textAnchor="middle"
                    fill={ iS ? "var(--ac)" : "var(--fg)" }
                    fontSize="11"
                    fontFamily="'Source Code Pro',monospace"
                    fontWeight="500"
                    style={ { cursor: "pointer", userSelect: "none" } }
                    onClick={ ( e ) => handleEdgeClick( e, ep.id ) }
                  >
                    { ep.event }
                  </text>
                </g>
              );
            } ) }
            { initialStateId && nodeMap[ initialStateId ] && (
              <line
                x1={ nodeMap[ initialStateId ].x - R - 30 }
                y1={ nodeMap[ initialStateId ].y }
                x2={ nodeMap[ initialStateId ].x - R - 2 }
                y2={ nodeMap[ initialStateId ].y }
                stroke="var(--ac)"
                strokeWidth="2"
                markerEnd="url(#ahs)"
              />
            ) }
            { nodes.map( ( n ) =>
            {
              const iS = selectedId === n.id,
                iSm = simRunning && simState === n.id,
                iF = finalSet.has( n.id ),
                iU = initialStateId && !analysis.reachable.has( n.id ),
                iD = analysis.dead.has( n.id );
              let sk = "var(--fd)",
                fk = "rgba(22,27,34,0.9)";
              if ( iSm )
              {
                sk = "var(--a2)";
                fk = "rgba(63,185,80,0.15)";
              } else if ( iS )
              {
                sk = "var(--ac)";
                fk = "rgba(88,166,255,0.08)";
              } else if ( transitionSource === n.id ) sk = "var(--ac)";
              else if ( iU )
              {
                sk = "#484f58";
                fk = "rgba(72,79,88,0.1)";
              } else if ( iD ) sk = "var(--wr)";
              return (
                <g
                  key={ n.id }
                  style={ { cursor: mode === "select" ? "grab" : "pointer" } }
                  onClick={ ( e ) => handleNodeClick( e, n.id ) }
                  onMouseDown={ ( e ) => handleMouseDown( e, n.id ) }
                >
                  <circle
                    cx={ n.x }
                    cy={ n.y }
                    r={ R }
                    fill={ fk }
                    stroke={ sk }
                    strokeWidth={ iS || iSm ? 2.5 : 1.5 }
                    style={
                      iSm ? { animation: "pN 1.5s ease-in-out infinite" } : {}
                    }
                  />
                  { iF && (
                    <circle
                      cx={ n.x }
                      cy={ n.y }
                      r={ R - 4 }
                      fill="none"
                      stroke={ sk }
                      strokeWidth="1.5"
                      style={ { pointerEvents: "none" } }
                    />
                  ) }
                  <text
                    x={ n.x }
                    y={ n.y + 1 }
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={
                      iSm
                        ? "var(--a2)"
                        : iS
                          ? "var(--ac)"
                          : iU
                            ? "#484f58"
                            : "var(--fg)"
                    }
                    fontSize="11"
                    fontFamily="'Source Code Pro',monospace"
                    fontWeight="500"
                    style={ { pointerEvents: "none", userSelect: "none" } }
                  >
                    { n.name }
                  </text>
                </g>
              );
            } ) }
          </svg>
          { nodes.length === 0 && (
            <div
              style={ {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                color: "var(--fd)",
                fontSize: "13px",
                textAlign: "center",
                lineHeight: 1.8,
                pointerEvents: "none",
              } }
            >
              <div
                style={ {
                  fontFamily: "'Source Code Pro',monospace",
                  fontSize: "14px",
                  color: "var(--ac)",
                  marginBottom: "8px",
                } }
              >
                (state, event) =&gt; newState
              </div>
              Click "+ State" or load a preset.
              <br />
              Use "Import" to load a .json file.
            </div>
          ) }
          { ( selectedNode || selectedEdge ) && (
            <div
              style={ {
                position: "absolute",
                bottom: "12px",
                left: "12px",
                background: "var(--s2)",
                border: "1px solid var(--bd)",
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontSize: "12px",
                minWidth: "180px",
              } }
            >
              { selectedNode && (
                <>
                  <div
                    style={ {
                      color: "var(--fd)",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    } }
                  >
                    State
                  </div>
                  { editingName?.t === "node" &&
                    editingName?.id === selectedNode.id ? (
                    <input
                      ref={ nameInputRef }
                      value={ editValue }
                      onChange={ ( e ) => setEditValue( e.target.value ) }
                      onBlur={ commitEdit }
                      onKeyDown={ ( e ) =>
                      {
                        if ( e.key === "Enter" ) commitEdit();
                        if ( e.key === "Escape" ) setEditingName( null );
                      } }
                      style={ { width: "120px" } }
                    />
                  ) : (
                    <div
                      style={ {
                        fontFamily: "'Source Code Pro',monospace",
                        color: "var(--ac)",
                        cursor: "pointer",
                      } }
                      onClick={ startEditing }
                    >
                      { selectedNode.name }
                    </div>
                  ) }
                  <div
                    style={ { display: "flex", gap: "4px", flexWrap: "wrap" } }
                  >
                    <button
                      style={ sb }
                      onClick={ startEditing }
                    >
                      Rename
                    </button>
                    <button
                      style={ sb }
                      onClick={ () => setInitialStateId( selectedNode.id ) }
                    >
                      { initialStateId === selectedNode.id
                        ? "Initial *"
                        : "Set Initial" }
                    </button>
                    <button
                      style={ sb }
                      onClick={ () => toggleFinal( selectedNode.id ) }
                    >
                      { finalSet.has( selectedNode.id )
                        ? "Final *"
                        : "Toggle Final" }
                    </button>
                    <button
                      style={ db }
                      onClick={ () => deleteNode( selectedNode.id ) }
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) }
              { selectedEdge && (
                <>
                  <div
                    style={ {
                      color: "var(--fd)",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    } }
                  >
                    Transition
                  </div>
                  <div
                    style={ {
                      fontFamily: "'Source Code Pro',monospace",
                      fontSize: "12px",
                    } }
                  >
                    { nodeMap[ selectedEdge.from ]?.name } --[
                    { editingName?.t === "edge" &&
                      editingName?.id === selectedEdge.id ? (
                      <input
                        ref={ nameInputRef }
                        value={ editValue }
                        onChange={ ( e ) => setEditValue( e.target.value ) }
                        onBlur={ commitEdit }
                        onKeyDown={ ( e ) =>
                        {
                          if ( e.key === "Enter" ) commitEdit();
                          if ( e.key === "Escape" ) setEditingName( null );
                        } }
                        style={ { width: "80px", display: "inline" } }
                      />
                    ) : (
                      <span
                        style={ { color: "var(--ac)", cursor: "pointer" } }
                        onClick={ startEditing }
                      >
                        { selectedEdge.event }
                      </span>
                    ) }
                    ]--&gt; { nodeMap[ selectedEdge.to ]?.name }
                  </div>
                  <div style={ { display: "flex", gap: "4px" } }>
                    <button
                      style={ sb }
                      onClick={ startEditing }
                    >
                      Rename
                    </button>
                    <button
                      style={ db }
                      onClick={ () => deleteEdge( selectedEdge.id ) }
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) }
            </div>
          ) }
        </div>
        <div
          style={ {
            flex: "0 0 40%",
            maxWidth: "480px",
            minWidth: "280px",
            display: "flex",
            flexDirection: "column",
            background: "var(--sf)",
            overflow: "hidden",
          } }
        >
          <div
            style={ {
              display: "flex",
              borderBottom: "1px solid var(--bd)",
              flexShrink: 0,
            } }
          >
            { [ "table", "simulate", "code", "analysis" ].map( ( t ) => (
              <button
                key={ t }
                style={ tb( t ) }
                onClick={ () => setActiveTab( t ) }
              >
                { t }
              </button>
            ) ) }
          </div>
          <div style={ { flex: 1, overflow: "auto", padding: "12px" } }>
            { activeTab === "table" && (
              <div>
                <div
                  style={ {
                    fontSize: "10px",
                    color: "var(--fd)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  } }
                >
                  Transition Table
                </div>
                { nodes.length === 0 ? (
                  <div style={ { color: "var(--fd)", fontSize: "12px" } }>
                    No states.
                  </div>
                ) : (
                  <div style={ { overflowX: "auto" } }>
                    <table
                      style={ {
                        borderCollapse: "collapse",
                        fontFamily: "'Source Code Pro',monospace",
                        fontSize: "11px",
                        width: "100%",
                      } }
                    >
                      <thead>
                        <tr>
                          <th
                            style={ {
                              padding: "6px 8px",
                              borderBottom: "1px solid var(--bd)",
                              textAlign: "left",
                              color: "var(--fd)",
                              fontWeight: 500,
                            } }
                          >
                            State
                          </th>
                          { allEvents.map( ( ev ) => (
                            <th
                              key={ ev }
                              style={ {
                                padding: "6px 8px",
                                borderBottom: "1px solid var(--bd)",
                                textAlign: "center",
                                color: "var(--a3)",
                                fontWeight: 500,
                              } }
                            >
                              { ev }
                            </th>
                          ) ) }
                        </tr>
                      </thead>
                      <tbody>
                        { nodes.map( ( n ) => (
                          <tr key={ n.id }>
                            <td
                              style={ {
                                padding: "6px 8px",
                                borderBottom: "1px solid var(--bd)",
                                color:
                                  initialStateId === n.id
                                    ? "var(--ac)"
                                    : "var(--fg)",
                                fontWeight: initialStateId === n.id ? 600 : 400,
                              } }
                            >
                              { n.name }
                              { initialStateId === n.id ? " *" : "" }
                              { finalSet.has( n.id ) ? " (F)" : "" }
                            </td>
                            { allEvents.map( ( ev ) =>
                            {
                              const edge = edges.find(
                                ( e ) => e.from === n.id && e.event === ev,
                              );
                              return (
                                <td
                                  key={ ev }
                                  style={ {
                                    padding: "4px 6px",
                                    borderBottom: "1px solid var(--bd)",
                                    textAlign: "center",
                                  } }
                                >
                                  <select
                                    value={ edge ? edge.to : "" }
                                    onChange={ ( e ) =>
                                    {
                                      if ( e.target.value === "" && edge )
                                        deleteEdge( edge.id );
                                      else if ( e.target.value )
                                        addTransFromTable(
                                          n.id,
                                          ev,
                                          e.target.value,
                                        );
                                    } }
                                  >
                                    <option value="">--</option>
                                    { nodes.map( ( t ) => (
                                      <option
                                        key={ t.id }
                                        value={ t.id }
                                      >
                                        { t.name }
                                      </option>
                                    ) ) }
                                  </select>
                                </td>
                              );
                            } ) }
                          </tr>
                        ) ) }
                      </tbody>
                    </table>
                  </div>
                ) }
              </div>
            ) }
            { activeTab === "simulate" && (
              <div>
                <div
                  style={ {
                    fontSize: "10px",
                    color: "var(--fd)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  } }
                >
                  Simulator
                </div>
                { !simRunning ? (
                  <div style={ { fontSize: "12px", color: "var(--fd)" } }>
                    Press "Sim" to start.
                    { !initialStateId && " Set an initial state first." }
                  </div>
                ) : (
                  <div
                    style={ {
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    } }
                  >
                    <div>
                      <span style={ { fontSize: "11px", color: "var(--fd)" } }>
                        Current:{ " " }
                      </span>
                      <span
                        style={ {
                          fontFamily: "'Source Code Pro',monospace",
                          color: "var(--a2)",
                          fontWeight: 600,
                        } }
                      >
                        { nodeMap[ simState ]?.name || "--" }
                      </span>
                      { simState && finalSet.has( simState ) && (
                        <span
                          style={ {
                            marginLeft: "8px",
                            fontSize: "10px",
                            color: "var(--a2)",
                            border: "1px solid var(--a2)",
                            padding: "1px 6px",
                          } }
                        >
                          ACCEPTING
                        </span>
                      ) }
                    </div>
                    <div>
                      <div
                        style={ {
                          fontSize: "10px",
                          color: "var(--fd)",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                        } }
                      >
                        Fire Event
                      </div>
                      <div
                        style={ {
                          display: "flex",
                          gap: "4px",
                          flexWrap: "wrap",
                        } }
                      >
                        { allEvents.map( ( ev ) =>
                        {
                          const c = availableEvents.includes( ev );
                          return (
                            <button
                              key={ ev }
                              disabled={ !c }
                              onClick={ () => simStep( ev ) }
                              style={ {
                                ...sb,
                                fontFamily: "'Source Code Pro',monospace",
                                opacity: c ? 1 : 0.3,
                                cursor: c ? "pointer" : "not-allowed",
                                borderColor: c ? "var(--ac)" : "var(--bd)",
                                color: c ? "var(--ac)" : "var(--fd)",
                              } }
                            >
                              { ev }
                            </button>
                          );
                        } ) }
                      </div>
                    </div>
                    <div>
                      <div
                        style={ {
                          fontSize: "10px",
                          color: "var(--fd)",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                        } }
                      >
                        Sequence
                      </div>
                      <div style={ { display: "flex", gap: "4px" } }>
                        <input
                          value={ seqInput }
                          onChange={ ( e ) => setSeqInput( e.target.value ) }
                          placeholder="FETCH, RESOLVE, ..."
                          style={ { flex: 1 } }
                        />
                        <button
                          style={ sb }
                          onClick={ runSequence }
                        >
                          Run
                        </button>
                      </div>
                      <div
                        style={ {
                          fontSize: "10px",
                          color: "var(--fd)",
                          marginTop: "2px",
                        } }
                      >
                        events.reduce(transition, init)
                      </div>
                    </div>
                    <button
                      style={ { ...sb, alignSelf: "flex-start" } }
                      onClick={ simReset }
                    >
                      Reset
                    </button>
                    <div>
                      <div
                        style={ {
                          fontSize: "10px",
                          color: "var(--fd)",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                        } }
                      >
                        Log
                      </div>
                      <div
                        style={ {
                          maxHeight: "200px",
                          overflow: "auto",
                          fontFamily: "'Source Code Pro',monospace",
                          fontSize: "11px",
                          lineHeight: 1.7,
                        } }
                      >
                        { simLog.length === 0 && (
                          <span style={ { color: "var(--fd)" } }>No events.</span>
                        ) }
                        { simLog.map( ( e, i ) => (
                          <div key={ i }>
                            <span style={ { color: "var(--fd)" } }>{ i + 1 }.</span>{ " " }
                            { e.from }{ " " }
                            <span style={ { color: "var(--a3)" } }>
                              --[{ e.event }]--&gt;
                            </span>{ " " }
                            <span
                              style={ {
                                color:
                                  e.to === "[UNDEF]"
                                    ? "var(--er)"
                                    : "var(--a2)",
                              } }
                            >
                              { e.to }
                            </span>
                          </div>
                        ) ) }
                      </div>
                    </div>
                  </div>
                ) }
              </div>
            ) }
            { activeTab === "code" && (
              <div>
                <div
                  style={ {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  } }
                >
                  <div
                    style={ {
                      fontSize: "10px",
                      color: "var(--fd)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    } }
                  >
                    Generated TypeScript
                  </div>
                  <button
                    style={ sb }
                    onClick={ () =>
                      navigator.clipboard?.writeText( generatedCode )
                    }
                  >
                    Copy
                  </button>
                </div>
                <pre
                  style={ {
                    fontFamily: "'Source Code Pro',monospace",
                    fontSize: "11.5px",
                    lineHeight: 1.65,
                    background: "var(--bg)",
                    border: "1px solid var(--bd)",
                    padding: "12px",
                    overflow: "auto",
                    maxHeight: "calc(100vh - 180px)",
                    whiteSpace: "pre",
                    tabSize: 2,
                  } }
                  dangerouslySetInnerHTML={ { __html: hlTS( generatedCode ) } }
                />
              </div>
            ) }
            { activeTab === "analysis" && (
              <div
                style={ {
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  fontSize: "12px",
                } }
              >
                <div
                  style={ {
                    fontSize: "10px",
                    color: "var(--fd)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  } }
                >
                  Analysis
                </div>
                { nodes.length === 0 ? (
                  <div style={ { color: "var(--fd)" } }>No machine.</div>
                ) : (
                  <>
                    <div>
                      <div
                        style={ {
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "var(--ac)",
                        } }
                      >
                        Reachability
                      </div>
                      { !initialStateId ? (
                        <div style={ { color: "var(--fd)" } }>
                          No initial state.
                        </div>
                      ) : (
                        <div
                          style={ {
                            fontFamily: "'Source Code Pro',monospace",
                            fontSize: "11px",
                            lineHeight: 1.6,
                          } }
                        >
                          { nodes.map( ( n ) => (
                            <div key={ n.id }>
                              <span
                                style={ {
                                  color: analysis.reachable.has( n.id )
                                    ? "var(--a2)"
                                    : "#484f58",
                                } }
                              >
                                { analysis.reachable.has( n.id )
                                  ? "[ok]"
                                  : "[unreachable]" }
                              </span>{ " " }
                              { n.name }
                            </div>
                          ) ) }
                        </div>
                      ) }
                    </div>
                    <div>
                      <div
                        style={ {
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "var(--ac)",
                        } }
                      >
                        Determinism
                      </div>
                      { analysis.nondet.length === 0 ? (
                        <div style={ { color: "var(--a2)" } }>Deterministic.</div>
                      ) : (
                        <div
                          style={ {
                            fontFamily: "'Source Code Pro',monospace",
                            fontSize: "11px",
                            lineHeight: 1.6,
                            color: "var(--er)",
                          } }
                        >
                          { analysis.nondet.map( ( d, i ) => (
                            <div key={ i }>
                              ({ nodeMap[ d.state ]?.name }, { d.event }) multi
                            </div>
                          ) ) }
                        </div>
                      ) }
                    </div>
                    <div>
                      <div
                        style={ {
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "var(--ac)",
                        } }
                      >
                        Dead States
                      </div>
                      { finalStateIds.length === 0 ? (
                        <div style={ { color: "var(--fd)" } }>
                          No final states.
                        </div>
                      ) : analysis.dead.size === 0 ? (
                        <div style={ { color: "var(--a2)" } }>None.</div>
                      ) : (
                        <div
                          style={ {
                            fontFamily: "'Source Code Pro',monospace",
                            fontSize: "11px",
                          } }
                        >
                          { [ ...analysis.dead ].map( ( id ) => (
                            <div
                              key={ id }
                              style={ { color: "var(--wr)" } }
                            >
                              { nodeMap[ id ]?.name }
                            </div>
                          ) ) }
                        </div>
                      ) }
                    </div>
                    <div>
                      <div
                        style={ {
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "var(--ac)",
                        } }
                      >
                        Completeness
                      </div>
                      { Object.keys( analysis.unhandled ).length === 0 ? (
                        <div style={ { color: "var(--a2)" } }>Complete.</div>
                      ) : (
                        <div
                          style={ {
                            fontFamily: "'Source Code Pro',monospace",
                            fontSize: "11px",
                            lineHeight: 1.6,
                          } }
                        >
                          { Object.entries( analysis.unhandled ).map( ( [ n, e ] ) => (
                            <div key={ n }>
                              { n }:{ " " }
                              <span style={ { color: "var(--wr)" } }>
                                { e.join( ", " ) }
                              </span>
                            </div>
                          ) ) }
                        </div>
                      ) }
                    </div>
                    <div>
                      <div
                        style={ {
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "var(--ac)",
                        } }
                      >
                        Minimization (Hopcroft)
                      </div>
                      { !analysis.minimized ? (
                        <div style={ { color: "var(--fd)" } }>
                          Cannot minimize.
                        </div>
                      ) : (
                        <div>
                          <div style={ { fontSize: "11px" } }>
                            { nodes.length }S/{ edges.length }E -&gt;{ " " }
                            { analysis.minimized.nodes.length }S/
                            { analysis.minimized.edges.length }E
                          </div>
                          { analysis.minimized.nodes.length < nodes.length ? (
                            <div
                              style={ {
                                fontFamily: "'Source Code Pro',monospace",
                                fontSize: "11px",
                                lineHeight: 1.6,
                                background: "var(--bg)",
                                padding: "6px",
                                border: "1px solid var(--bd)",
                                marginTop: "4px",
                              } }
                            >
                              { analysis.minimized.nodes.map( ( mn ) => (
                                <div key={ mn.id }>
                                  { mn.name.includes( "/" )
                                    ? `{${ mn.name }}`
                                    : mn.name }
                                  { analysis.minimized.initialStateId === mn.id
                                    ? " (init)"
                                    : "" }
                                  { analysis.minimized.finalStateIds.includes(
                                    mn.id,
                                  )
                                    ? " (final)"
                                    : "" }
                                </div>
                              ) ) }
                            </div>
                          ) : (
                            <div
                              style={ {
                                color: "var(--a2)",
                                fontSize: "11px",
                                marginTop: "2px",
                              } }
                            >
                              Already minimal.
                            </div>
                          ) }
                        </div>
                      ) }
                    </div>
                    <div>
                      <div
                        style={ {
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "var(--ac)",
                        } }
                      >
                        Language Examples
                      </div>
                      { finalStateIds.length === 0 ? (
                        <div style={ { color: "var(--fd)" } }>
                          No final states.
                        </div>
                      ) : (
                        <div
                          style={ {
                            fontFamily: "'Source Code Pro',monospace",
                            fontSize: "11px",
                            lineHeight: 1.6,
                          } }
                        >
                          { analysis.strings.accepted.length > 0 && (
                            <div style={ { marginBottom: "4px" } }>
                              <div style={ { color: "var(--a2)" } }>
                                Accepted:
                              </div>
                              { analysis.strings.accepted.map( ( s, i ) => (
                                <div key={ i }>[{ s }]</div>
                              ) ) }
                            </div>
                          ) }
                          { analysis.strings.rejected.length > 0 && (
                            <div>
                              <div style={ { color: "var(--er)" } }>
                                Rejected:
                              </div>
                              { analysis.strings.rejected.map( ( s, i ) => (
                                <div key={ i }>[{ s }]</div>
                              ) ) }
                            </div>
                          ) }
                        </div>
                      ) }
                    </div>
                  </>
                ) }
              </div>
            ) }
          </div>
        </div>
      </div>
    </div>
  );
}
