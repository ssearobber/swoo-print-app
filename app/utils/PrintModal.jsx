import React, { useRef } from 'react';
import { Modal, TitleBar, useAppBridge } from '@shopify/app-bridge-react';
import { Button, Text } from "@shopify/polaris";
import styles from "./printModal.module.css";
import ReactToPrint from 'react-to-print';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

const ReceiptContent = React.forwardRef(({order}, ref) => (
  <div className={styles.print_container}>
    <div className={styles.print_page} ref={ref}>
    <h1 className={styles.print_title}>領収書</h1>
      <Text alignment="end" variant="bodyLg" as="p">
        <Text as="span">No.&nbsp;</Text>
        <Text as="span">{order.id}</Text>
      </Text>
      <Text alignment="end" variant="bodyLg" as="p">
        <Text as="span">{order.createdAt}</Text>
      </Text>
      <div className={styles.customer_info}>
        <div className={styles.customer_box}>
          <h2 className={styles.customer_name}>{order.displayName}&nbsp;&nbsp;&nbsp;様</h2>
        </div>
        <div className={styles.customer_box_2}>
          <h2>1acspaces</h2>
          <div>107-0062</div>
          <div>東京都港区南青山3丁目1番36号</div>
          <div>青山丸竹ビル6F</div>
          <div>TEL: 050-1809-4046</div>
        </div>
      </div>
      <div className={styles.item_total_price}>
        <table>
          <tbody>
            <tr>
              <th>合計金額</th>
              <td>{order.totalPrice}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.item_detail}>
        <table>
          <thead>
            <tr>
              <th className={styles.item}>品名</th>
              <th className={styles.unit_price}>単価</th>
              <th className={styles.amount}>数量</th>
              <th className={styles.subtotal}>金額</th>
            </tr>
          </thead>
          <tbody>
            {order.items.slice(0, 10).map((itemEdge, index) => {
              let item = itemEdge?.node;
              return (
                <tr key={index} className={styles.dataline}>
                  <td>
                    <span>{item ? item.title : ""}</span>
                  </td>
                  <td>
                    <div>
                      <div>
                      {formatCurrency(parseFloat(item ? item.originalUnitPriceSet.presentmentMoney.amount : 0))}
                      </div>
                    </div>
                  </td>
                  <td>{item ? item.quantity : ""}</td>
                  <td>
                    <div>
                      {item
                        ? formatCurrency(parseFloat(
                            item.quantity *
                            parseFloat(item.originalUnitPriceSet.presentmentMoney.amount)
                          ))
                        : ""}
                    </div>
                  </td>
                </tr>
              );
            })}
            {[...Array(10 - order.items.length).keys()].map((_, index) => (
              <tr key={index} className={styles.dataline}>
              <td><br/></td>
              <td><br/></td>
              <td><br/></td>
              <td><br/></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={styles.space} colspan="2">&nbsp;</td>
              <th>小計</th>
              <td>{order.subtotalPrice}</td>
            </tr>
            <tr>
              <td className={styles.space} colspan="2">&nbsp;</td>
              <th>送料<span class="little"></span></th>
              <td>￥0</td>
            </tr>
            <tr>
              <td className={styles.space} colspan="2"></td>
              <th>税 <span class="little">(10%)</span></th>
              <td>(<span>{order.totalTax}</span>)</td>
            </tr>
            <tr>
              <td className={styles.space} colspan="2"> </td>
              <th>合計</th>
              <td>{order.totalPrice}</td>
            </tr>
          </tfoot>
        </table>
      </div>  
    </div>
  </div>
));

const PrintModal = ({ order, open }) => {
  const printRef = useRef();
  const shopify = useAppBridge();

  // 왜 훅으로는 안될까..?
  // const handlePrint = ReactToPrint.useReactToPrint({
  //   content: () => printPageRef.current,
  // });

  return (
    <>
      {/* <Button onClick={() => shopify.modal.show('my-modal')}>領収書</Button> */}
      <Modal open={open} id="my-modal" variant="large">
        <ReceiptContent ref={printRef} order={order}/>
        <TitleBar title="領収書" />
        <div className={styles.modal_footer}>
          <ReactToPrint
            trigger={() => <Button primary>印刷</Button>}
            content={() => printRef.current}
          />
        </div>
      </Modal>
    </>
  );
};

export default PrintModal;
